// モーダル・ドロワー・シート・通知が「閉じるとき」の動き。
//
// 開く動きは CSS（index.css の .ml-ov など）だけで付くが、閉じる動きは React が要素を
// すぐ DOM から外してしまうので CSS だけでは付けられない。そこで、React が外した要素
// （.ml-ov / .ml-toast）を見つけたら、その要素を body の末尾に一瞬だけ戻し、
// .ml-out を付けて閉じる動きを再生してから取り除く。
//   - 戻した要素は React の管理外（押しても何も起きない・操作は下の画面に通る）
//   - 入力欄の値はそのまま残る（同じ要素を戻すため）。スクロール位置は外れると 0 に戻るので覚えておいて戻す
//   - 同じ操作で別のオーバーレイに差し替わったときは、暗い背景が二重になるので動かさない
// うまく動かない環境では何もしない（＝従来どおり一瞬で消えるだけ）。

const EXIT_MS = 176; // index.css の --ml-out と合わせる
let started = false;
const scrollPos = new WeakMap();

const isTarget = (n) =>
  n && n.nodeType === 1 && n.classList
  && (n.classList.contains("ml-ov") || n.classList.contains("ml-toast"))
  && !n.hasAttribute("data-ml-ghost");

function playExit(node) {
  // 中でスクロールしていた位置を拾っておく（DOM に戻すと 0 になるため）
  const restore = [];
  if (scrollPos.has(node)) restore.push([node, scrollPos.get(node)]);
  node.querySelectorAll("*").forEach((el) => { if (scrollPos.has(el)) restore.push([el, scrollPos.get(el)]); });

  node.setAttribute("data-ml-ghost", "");
  node.setAttribute("aria-hidden", "true");
  try { node.inert = true; } catch { /* 未対応のブラウザは pointer-events:none だけで足りる */ }
  node.classList.add("ml-out");
  document.body.appendChild(node);
  restore.forEach(([el, top]) => { el.scrollTop = top; });
  setTimeout(() => { node.remove(); }, EXIT_MS + 30);
}

export function startOverlayExit() {
  if (started || typeof document === "undefined" || typeof MutationObserver === "undefined") return;
  started = true;

  // オーバーレイの中のスクロール位置を覚える
  document.addEventListener("scroll", (e) => {
    const t = e.target;
    if (t && t.nodeType === 1 && t.closest && t.closest(".ml-ov")) scrollPos.set(t, t.scrollTop);
  }, true);

  const observer = new MutationObserver((records) => {
    const removed = [];
    const added = [];
    records.forEach((r) => {
      r.removedNodes.forEach((n) => { if (isTarget(n) && !n.isConnected) removed.push(n); });
      r.addedNodes.forEach((n) => { if (isTarget(n)) added.push(n); });
    });
    if (!removed.length) return;
    // 差し替え（閉じると同時に別のオーバーレイが開いた）：どちらも動かさず、従来どおり一瞬で切り替える
    const swapped = removed.some((n) => n.classList.contains("ml-ov")) && added.some((n) => n.classList.contains("ml-ov"));
    if (swapped) {
      added.forEach((n) => n.setAttribute("data-ml-swap", ""));
      return;
    }
    removed.forEach(playExit);
  });
  observer.observe(document.body, { childList: true, subtree: true });
}
