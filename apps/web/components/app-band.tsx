import { Mark } from './mark';

/** شريط «حمّل التطبيق» — .band.light من المعاينة */
export function AppBand() {
  return (
    <section id="app" className="wrap sec last">
      <div className="band light">
        <span className="appicon"><Mark size={74} style={{ color: '#fff' }} /></span>
        <div className="band-text">
          <h2>حمّل تطبيق ساحة</h2>
          <p className="muted">إشعارات المباريات، تأكيد النتائج، وإدارة فريقك من جوالك. قريباً على المتاجر.</p>
        </div>
        <div className="row"><span className="btn btn-ink" aria-disabled="true">App Store — قريباً</span><span className="btn btn-ink" aria-disabled="true">Google Play — قريباً</span></div>
      </div>
    </section>
  );
}
