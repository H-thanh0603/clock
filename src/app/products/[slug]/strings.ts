import { serverT } from "@/i18n/server";
import type { Locale } from "@/i18n/dict";

/**
 * Chuỗi tĩnh trang chi tiết sản phẩm (server component).
 * Tên/spec/giá lấy từ DB (giữ nguyên mọi locale); chỉ khung UI dịch.
 */
export async function productStrings(locale: Locale) {
  const { t } = await serverT(locale);
  return {
    breadcrumbHome: t("product.home"),
    breadcrumbCollection: t("product.collection"),
    inStock: t("product.inStock"),
    preOrder: t("product.preOrder"),
    spin360: t("product.spin360"),
    tryAR: t("product.tryAR"),
    limited: t("product.limited"),
    compareCta: t("product.compareCta"),
    watchCta: t("product.watchCta"),
    securityTitle: t("product.securityTitle"),
    securityBody: t("product.securityBody"),
    heritageTitle: t("product.heritageTitle"),
    heritageBody: t("product.heritageBody"),
    returnTitle: t("product.returnTitle"),
    returnBody: t("product.returnBody"),
    specsTitle: t("product.specsTitle"),
    status: (inBoutique: boolean) =>
      inBoutique ? t("product.inStock") : t("product.preOrder"),
  };
}
