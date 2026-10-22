/** System serif stacks keep the board readable without third-party font requests. */
export const POSTER_STYLE = `
*{box-sizing:border-box}body{margin:0;color:#342419;background:#211d18;font:16px/1.8 'Yu Mincho','Hiragino Mincho ProN','Noto Serif JP',serif}
a{color:inherit}header,main,footer{max-width:1200px;margin:auto;padding:28px}header{color:#eadbc1;border-bottom:1px solid #81715a}
.eyebrow{font:700 12px/1.4 Georgia,serif;letter-spacing:.3em;color:#bc9d6b}h1{font-size:clamp(30px,5vw,54px);margin:8px 0;letter-spacing:.12em}
.intro{max-width:44em;color:#c4b8a3}.topline{display:flex;justify-content:space-between;gap:20px;align-items:center}.topline a{font-size:14px}
.board{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,310px),1fr));gap:32px;align-items:start}
.poster{position:relative;padding:32px 26px 26px;background-color:#e8d6af;background-image:repeating-linear-gradient(4deg,transparent 0 3px,#61452c08 3px 4px),radial-gradient(ellipse at 40% 30%,#fff6d9b3,transparent 70%),linear-gradient(100deg,#b9945e55,transparent 20%,transparent 80%,#b9945e66);box-shadow:0 8px 24px #0007,inset 0 0 35px #87633455;border:1px solid #a68c64}
.poster:before{content:'';display:block;position:absolute;width:11px;height:11px;border-radius:50%;background:#8e3b2e;box-shadow:2px 3px 3px #34241988;top:10px;left:calc(50% - 5px)}
.wanted{text-align:center;font:900 clamp(32px,4vw,46px)/1.1 Georgia,'Times New Roman',serif;letter-spacing:.12em;border-top:3px double #665038;border-bottom:3px double #665038;padding:12px 0;margin:0 0 18px}
.category{font:700 12px/1.4 sans-serif;letter-spacing:.14em;text-align:center}.poster h2{font-size:24px;line-height:1.5;text-align:center;overflow-wrap:anywhere;margin:18px 0}
.description,.contact{white-space:pre-wrap;overflow-wrap:anywhere}.description{font-family:'Yu Gothic','Hiragino Kaku Gothic ProN',sans-serif;font-size:14px;line-height:1.9}
.contact-block{margin-top:24px;border-top:1px dashed #816a4d;padding-top:12px}.contact-label{font-size:12px;font-weight:bold}.contact{font-family:sans-serif;font-size:14px}
.seal{display:table;margin:22px 0 0 auto;padding:8px 12px;border:3px double #a0352e;color:#a0352e;transform:rotate(-6deg);font-weight:900;text-align:center;line-height:1.5;letter-spacing:.12em}.seal small{display:block;font:10px/1.4 sans-serif;letter-spacing:0}
.note{font-size:12px;color:#66533d}.empty{color:#eadbc1;padding:60px 0}.footer{color:#b7aa94;font:13px/1.8 sans-serif}button,input,textarea,select{font:inherit}
@media(max-width:600px){header,main,footer{padding:20px}.board{gap:24px}.poster{padding:30px 22px 22px}.topline{align-items:start}}
`;
