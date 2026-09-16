import { expect, test } from "@playwright/test";

/**
 * E2E luồng tiền (P2-4) trên backend dev (simulated methods bật):
 * 1. Khách vãng lai: catalog → detail → Mua Ngay → giỏ → checkout (deposit)
 *    → mã đơn hiện inline.
 * 2. Đơn VNPay PENDING tạo qua API → trang tra đơn hiện trạng thái tối thiểu
 *    (P1-6) → nhập contact reveal chi tiết → hủy đơn → CANCELLED.
 *
 * Không chạm VNPay thật / agent host. Chạy: npm run test:e2e
 * (cần docker compose db + backend đã migrate + seed).
 */

const CONTACT = "0901234567";
const BE = "http://localhost:4000";

async function csrfToken(
  request: import("@playwright/test").APIRequestContext
): Promise<string> {
  // Bắt chước csrfFetch: GET /auth/csrf (cookie tự giữ trong context) rồi
  // gửi lại token qua header cho mọi request ghi.
  const csrf = await request.get(`${BE}/auth/csrf`);
  const { csrfToken } = await csrf.json();
  return csrfToken as string;
}

async function apiPost(
  request: import("@playwright/test").APIRequestContext,
  path: string,
  body: unknown,
  token: string
) {
  return request.post(`${BE}${path}`, {
    headers: { "Content-Type": "application/json", "x-csrf-token": token },
    data: body,
  });
}

async function apiPatch(
  request: import("@playwright/test").APIRequestContext,
  path: string,
  body: unknown,
  token: string
) {
  return request.patch(`${BE}${path}`, {
    headers: { "Content-Type": "application/json", "x-csrf-token": token },
    data: body,
  });
}

/** Dọn đơn test bằng quyền admin (CONFIRMED → CANCELLED hoàn kho). */
async function adminCancel(
  request: import("@playwright/test").APIRequestContext,
  orderId: string
) {
  const token = await csrfToken(request);
  const login = await apiPost(
    request,
    "/auth/login",
    { email: "admin@aurel.local", password: "Admin123!" },
    token
  );
  if (!login.ok()) return;
  await apiPatch(request, `/admin/orders/${orderId}`, { status: "CANCELLED" }, token);
}

test("guest mua deposit → có mã đơn + tra được trạng thái", async ({
  page,
  request,
}) => {
  let orderId = "";
  try {
    // Catalog → sản phẩm đầu tiên.
    await page.goto("/collections");
    const firstProduct = page.locator('a[href^="/products/"]').first();
    await expect(firstProduct).toBeVisible();
    await firstProduct.click();

    // Mua Ngay → sang giỏ.
    await page.getByRole("button", { name: /mua ngay/i }).click();
    await expect(page).toHaveURL(/\/cart/);

    // Sang checkout, điền form, tick consent, chọn deposit (dev).
    await page.locator('a[href="/checkout"]').click();
    await expect(page).toHaveURL(/\/checkout/);
    await page.getByTestId("co-name").fill("Khach E2E");
    await page.getByTestId("co-contact").fill(CONTACT);
    await page.getByTestId("co-address").fill("123 Test, Q1, TP.HCM");
    await page.getByTestId("co-consent").check();
    await page.locator('input[name="payment_tier"][value="deposit"]').check();

    // Bắt orderId từ response để dọn sau test (trả kho cho lần chạy sau).
    const [resp] = await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes("/orders") && r.request().method() === "POST"
      ),
      page.getByTestId("co-place").click(),
    ]);
    orderId = ((await resp.json()) as { orderId?: string }).orderId ?? "";

    // Thành công inline + mã đơn dạng AC-YYYY-NNNNNN.
    const success = page.getByTestId("co-success-code");
    await expect(success).toBeVisible();
    const code = ((await success.textContent()) ?? "").match(
      /AC-\d{4}-\d{6}/
    )?.[0];
    expect(code).toBeTruthy();

    // Trang tra đơn (không sig/contact) → chỉ status, không items.
    await page.goto(`/orders/${code}`);
    await expect(page.getByText(/đơn đã được.*tiếp nhận/i)).toBeVisible();
  } finally {
    // CONFIRMED không tự hủy được → admin hủy để hoàn kho cho lần sau.
    if (orderId) await adminCancel(request, orderId);
  }
});

test("đơn PENDING tra cứu tối thiểu → reveal bằng contact → hủy được", async ({
  page,
  request,
}) => {
  // Tạo đơn VNPay PENDING qua API (không redirect cổng).
  const token = await csrfToken(request);
  const res = await apiPost(
    request,
    "/orders",
    {
      customerName: "Khach E2E",
      contact: CONTACT,
      address: "123 Test",
      items: [
        {
          slug: "aquanaut-deep-sea-diver-500m",
          name: "Aquanaut",
          priceUsd: 28500,
          priceVnd: 0,
          image: "img",
          qty: 1,
        },
      ],
      payment: { method: "vnpay" },
      agreedTerms: true,
    },
    token
  );
  expect(res.ok()).toBeTruthy();
  const { code } = await res.json();
  expect(code).toMatch(/AC-\d{4}-\d{6}/);

  // Trang tra đơn: trạng thái có, chi tiết món ẩn + form reveal.
  await page.goto(`/orders/${code}`);
  await expect(page.getByText(/chờ xác nhận/i).first()).toBeVisible();
  await expect(page.getByText("Xem chi tiết")).toBeVisible();

  // Nhập contact → hiện chi tiết + nút hủy.
  await page.getByPlaceholder("SĐT hoặc email lúc đặt hàng").fill(CONTACT);
  await page.getByText("Xem chi tiết").click();
  await expect(page.getByText("Tổng quyết toán")).toBeVisible();

  // Hủy đơn vãng lai bằng chính contact.
  await page.getByText("Hủy đơn này").click();
  await page.getByPlaceholder("SĐT lúc đặt hàng").fill(CONTACT);
  await page.getByText("Xác nhận hủy").click();
  await expect(page.getByText(/đã hủy/i).first()).toBeVisible({
    timeout: 20_000,
  });
});
