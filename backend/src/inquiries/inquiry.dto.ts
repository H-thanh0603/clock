/** Body tạo inquiry — validate thủ công gọn (không cần class-validator). */
export type CreateInquiryDto = {
  type: string;
  name: string;
  phone: string;
  email?: string;
  message?: string;
  /** Cấu hình configurator (movement/case/dial/personal, estimatedUsd...) */
  payload?: Record<string, unknown> | null;
};
