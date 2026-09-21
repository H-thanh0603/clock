/**
 * Khối "quà tặng đi kèm" dùng chung cho cart + checkout (đợt i18n 8).
 *
 * Vì sao tách: 2 trang render cùng 1 khối ~120 dòng chữ Việt — dịch 1 nơi,
 * khỏi lệch nhau khi sửa. Không nhận props (nội dung tĩnh).
 */
import { useLocale } from "./LocaleProvider";

export function CompanionGifts() {
  const { t } = useLocale();
  return (
    <>
      <div>
        <div className="mt-space-lg pt-space-md bg-surface-container-low/80 p-space-md rounded">
          <h3 className="font-label-spec text-label-spec text-secondary uppercase tracking-[0.2em] mb-space-sm flex items-center gap-space-xs">
            <span className="material-symbols-outlined text-[18px]">inventory_2</span>
            {t("gifts.title")}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-space-md">
            <div className="bg-surface-container p-space-sm rounded flex gap-space-xs items-start">
              <span className="material-symbols-outlined text-primary text-[20px] shrink-0 mt-0.5">nest_eco_leaf</span>
              <div>
                <h4 className="font-title-editorial text-body-sm text-on-surface font-semibold">{t("gifts.boxTitle")}</h4>
                <p className="font-body-sm text-[11px] text-on-surface-variant/80 mt-1 leading-snug">{t("gifts.boxBody")}</p>
              </div>
            </div>
            <div className="bg-surface-container p-space-sm rounded flex gap-space-xs items-start">
              <span className="material-symbols-outlined text-primary text-[20px] shrink-0 mt-0.5">workspace_premium</span>
              <div>
                <h4 className="font-title-editorial text-body-sm text-on-surface font-semibold">{t("gifts.coscTitle")}</h4>
                <p className="font-body-sm text-[11px] text-on-surface-variant/80 mt-1 leading-snug">{t("gifts.coscBody")}</p>
              </div>
            </div>
            <div className="bg-surface-container p-space-sm rounded flex gap-space-xs items-start">
              <span className="material-symbols-outlined text-primary text-[20px] shrink-0 mt-0.5">search_insights</span>
              <div>
                <h4 className="font-title-editorial text-body-sm text-on-surface font-semibold">{t("gifts.loupeTitle")}</h4>
                <p className="font-body-sm text-[11px] text-on-surface-variant/80 mt-1 leading-snug">{t("gifts.loupeBody")}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="bg-surface-container-lowest rounded-lg p-space-lg md:p-space-xl shadow-xl space-y-space-lg">
        <div className="flex items-center justify-between pb-space-sm bg-surface-container-low/60 -mx-space-lg -mt-space-lg px-space-lg pt-space-md rounded-t-lg">
          <div className="flex items-center gap-space-xs">
            <span className="material-symbols-outlined text-primary text-[20px]">card_giftcard</span>
            <span className="font-label-spec text-label-spec text-primary uppercase tracking-[0.2em]">{t("gifts.packTitle")}</span>
          </div>
          <span className="font-label-badge text-label-badge text-secondary bg-surface-container-high px-2 py-0.5 rounded uppercase">{t("gifts.complimentary")}</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-space-lg">
          <div className="bg-surface-container p-space-md rounded flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-space-xs">
                <div className="flex items-center gap-space-xs">
                  <span className="material-symbols-outlined text-secondary text-[20px]">history_edu</span>
                  <h3 className="font-title-editorial text-body-md text-on-surface">{t("gifts.cardTitle")}</h3>
                </div>
                <input aria-label={t("gifts.cardTitle")} defaultChecked className="w-4 h-4 accent-primary rounded cursor-pointer" type="checkbox" />
              </div>
              <p className="font-body-sm text-body-sm text-on-surface-variant/80 mb-space-sm">
                {t("gifts.cardBody")}
              </p>
              <label className="block font-label-spec text-label-spec text-on-surface-variant uppercase tracking-wider mb-1">{t("gifts.dedication")}</label>
              <textarea aria-label={t("gifts.dedication")} className="w-full bg-surface-container-lowest text-on-surface text-body-sm p-space-sm rounded focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-on-surface-variant/40 resize-none" rows={3} defaultValue={t("gifts.dedicationDefault")} />
            </div>
            <span className="font-label-badge text-label-badge text-secondary mt-space-sm block">{t("gifts.cardBadge")}</span>
          </div>
          <div className="bg-surface-container p-space-md rounded flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-space-xs">
                <div className="flex items-center gap-space-xs">
                  <span className="material-symbols-outlined text-secondary text-[20px]">verified</span>
                  <h3 className="font-title-editorial text-body-md text-on-surface">{t("gifts.waxTitle")}</h3>
                </div>
                <input aria-label={t("gifts.waxTitle")} defaultChecked className="w-4 h-4 accent-primary rounded cursor-pointer" type="checkbox" />
              </div>
              <p className="font-body-sm text-body-sm text-on-surface-variant/80 mb-space-sm">
                {t("gifts.waxBody")}
              </p>
              <div className="bg-surface-container-lowest p-space-sm rounded flex items-center gap-space-sm">
                <div className="w-10 h-10 rounded-full bg-surface-container-high flex items-center justify-center text-primary font-title-editorial font-bold text-headline-sm shadow-inner">
                  A
                </div>
                <div>
                  <span className="font-label-spec text-label-spec text-on-surface block uppercase">{t("gifts.sealTitle")}</span>
                  <span className="text-on-surface-variant/80 text-xs">{t("gifts.sealBody")}</span>
                </div>
              </div>
            </div>
            <span className="font-label-badge text-label-badge text-secondary mt-space-sm block">{t("gifts.waxBadge")}</span>
          </div>
        </div>
      </div>
    </>
  );
}
