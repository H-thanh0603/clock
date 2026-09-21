import { serverT } from "@/i18n/server";
import type { Locale } from "@/i18n/dict";

/**
 * Chuỗi tĩnh trang Atelier/Di sản (server component).
 * Số liệu/năm/địa chỉ giữ nguyên mọi locale; chỉ khung văn bản dịch.
 */
export async function atelierStrings(locale: Locale) {
  const { t } = await serverT(locale);
  return {
    eyebrow: t("atelier.eyebrow"),
    heroA: t("atelier.heroA"),
    heroB: t("atelier.heroB"),
    heroC: t("atelier.heroC"),
    heroSub: t("atelier.heroSub"),
    workshopTitle: t("atelier.workshopTitle"),
    workshopSub: t("atelier.workshopSub"),
    craftTitle: t("atelier.craftTitle"),
    craftName: t("atelier.craftName"),
    craftDesc: t("atelier.craftDesc"),
    craftQuote: t("atelier.craftQuote"),
    craftBy: t("atelier.craftBy"),
    statYears: t("atelier.statYears"),
    statYearsSub: t("atelier.statYearsSub"),
    statHours: t("atelier.statHours"),
    statHoursSub: t("atelier.statHoursSub"),
    statCert: t("atelier.statCert"),
    statCertSub: t("atelier.statCertSub"),
    pillarsEyebrow: t("atelier.pillarsEyebrow"),
    pillarsTitle: t("atelier.pillarsTitle"),
    pillarsSub: t("atelier.pillarsSub"),
    timelineTitle: t("atelier.timelineTitle"),
    timelineSub: t("atelier.timelineSub"),
    standardsEyebrow: t("atelier.standardsEyebrow"),
    standardsTitle: t("atelier.standardsTitle"),
    standardsSub: t("atelier.standardsSub"),
    visitEyebrow: t("atelier.visitEyebrow"),
    visitTitleA: t("atelier.visitTitleA"),
    visitTitleB: t("atelier.visitTitleB"),
    visitBody: t("atelier.visitBody"),
    visitExpert: t("atelier.visitExpert"),
    visitPrivacy: t("atelier.visitPrivacy"),
    visitChampagne: t("atelier.visitChampagne"),
    visitLoupe: t("atelier.visitLoupe"),
    visitCta: t("atelier.visitCta"),
    bookTitle: t("atelier.bookTitle"),
    bookSub: t("atelier.bookSub"),
  };
}
