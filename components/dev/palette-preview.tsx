// Colour exploration preview (docs/TODO.md section 4). Renders nothing unless
// the build was made with NEXT_PUBLIC_PALETTE_PREVIEW=1, which no deployed
// environment sets, so the shipped theme cannot change. In a preview build,
// /any-page?palette=blue-court&mode=dark picks a set and it sticks for the
// tab; ?palette=default goes back.
const PALETTES = JSON.stringify(["blue-court", "red-clay", "club-lawn"]);

export function PalettePreviewScript() {
  if (process.env.NEXT_PUBLIC_PALETTE_PREVIEW !== "1") return null;
  return (
    <script
      dangerouslySetInnerHTML={{
        __html: `(function(){try{var q=new URLSearchParams(location.search),h=document.documentElement,p=q.get('palette'),m=q.get('mode');if(p){sessionStorage.setItem('seeded.palette',p);}p=sessionStorage.getItem('seeded.palette');if(${PALETTES}.indexOf(p)>-1){h.setAttribute('data-palette',p);}if(m==='light'||m==='dark'){localStorage.setItem('seeded.mode.system','0');localStorage.setItem('seeded.mode',m);h.setAttribute('data-seeded-mode',m);}}catch(e){}})();`,
      }}
    />
  );
}
