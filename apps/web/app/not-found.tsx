import Link from 'next/link';
export default function NotFound() {
  return (
    <div className="empty">
      <h2>الصفحة غير موجودة</h2>
      <Link href="/">العودة للرئيسية</Link>
    </div>
  );
}
