export default function NotFound() {
  return (
    <section className="wrap sec last">
      <div className="band light">
        <div className="band-text">
          <h2>الصفحة غير موجودة</h2>
          <p className="muted">ربما نُقلت أو حُذفت. ارجع للرئيسية وتابع البطولات من هناك.</p>
        </div>
        <a href="/" className="btn btn-primary">العودة للرئيسية</a>
      </div>
    </section>
  );
}
