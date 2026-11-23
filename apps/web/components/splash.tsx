import { TOURNAMENT_KINDS, TOURNAMENT_KIND_LABELS } from '@saha/shared';
import { brand } from '@saha/ui';
import { MARK_PATH, PitchLines } from './mark';

/**
 * شاشة البداية المتحركة — منقولة حرفياً من apps/preview (الحركة كلها CSS في saha.css).
 * تظهر مرة واحدة في كل جلسة، واللمس يتخطاها. السكربت يعمل فوراً قبل React (كما في المعاينة)
 * حتى لا تومض الشاشة لمن رآها.
 */
const SCRIPT = `(function(){var s=document.getElementById('splash');if(!s)return;
var r=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches,seen=false;
try{seen=sessionStorage.getItem('saha_splash')==='1'}catch(e){}
function hide(){if(s.classList.contains('out'))return;s.classList.add('out');document.body.classList.remove('locked');try{sessionStorage.setItem('saha_splash','1')}catch(e){}}
if(seen){s.classList.add('out');s.style.display='none'}else{document.body.classList.add('locked');s.addEventListener('click',hide);setTimeout(hide,r?900:3900)}})();`;

const PATCHES = [
  '0.00,-3.70 3.52,-1.14 2.17,2.99 -2.17,2.99 -3.52,-1.14',
  '3.53,-4.85 2.29,-8.66 5.53,-11.00 8.76,-8.66 7.52,-4.85',
  '5.71,1.85 8.94,-0.50 12.17,1.85 10.94,5.66 6.94,5.66',
  '0.00,6.00 3.23,8.35 2.00,12.15 -2.00,12.15 -3.23,8.35',
  '-5.71,1.85 -6.94,5.66 -10.94,5.66 -12.17,1.85 -8.94,-0.50',
  '-3.53,-4.85 -7.52,-4.85 -8.76,-8.66 -5.53,-11.00 -2.29,-8.66',
];

export function Splash() {
  return (
    <>
      <div id="splash" className="splash" aria-hidden="true" suppressHydrationWarning>
        <PitchLines variant="splash" />
        <div className="sp-center">
          <svg className="sp-mark" viewBox="0 0 120 120" width="150" height="150">
            <path className="sp-s" d={MARK_PATH} />
            <ellipse className="sp-shadow" cx="82" cy="45" rx="9" ry="2" />
            <circle className="sp-ring" cx="82" cy="34" r="10" />
            <g transform="translate(82 34)"><g className="sp-b"><g className="sp-spin">
              <circle r="10" fill="#fff" />
              <g clipPath="url(#ballClip)" fill="#0E1A24">
                {PATCHES.map((p) => <polygon key={p} points={p} />)}
              </g>
              <path className="seam" d="M0 -3.7 V-6 M3.52 -1.14 L5.71 -1.85 M2.17 2.99 L3.53 4.85 M-2.17 2.99 L-3.53 4.85 M-3.52 -1.14 L-5.71 -1.85" />
              <circle r="10" fill="none" stroke="#0E1A24" strokeWidth=".9" />
              <ellipse cx="-3.5" cy="-5" rx="3.2" ry="1.8" fill="#fff" opacity=".35" />
            </g></g></g>
          </svg>
          <div className="sp-word"><span>{brand.name}</span><i className="sp-shine" /></div>
          <p className="sp-tag">{brand.tagline}</p>
          <div className="sp-chips">
            {TOURNAMENT_KINDS.map((k, i) => <span key={k} className={`c${i + 1}`}>{TOURNAMENT_KIND_LABELS[k]}</span>)}
          </div>
        </div>
        <div className="sp-foot"><div className="bar"><i /></div><small>جمعية الميثاق الأعظم</small></div>
      </div>
      <script dangerouslySetInnerHTML={{ __html: SCRIPT }} />
    </>
  );
}

