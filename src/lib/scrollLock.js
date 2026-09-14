// モーダル／ドロワー表示中に背面（body）をスクロール・操作できないようにするためのフック。
// iOS Safari は body の overflow:hidden だけでは背面がスクロールできてしまうため、
// position:fixed でスクロール位置を固定し、解除時に元の位置へ戻す方式にしている。
import { useEffect } from "react";

let lockCount = 0; // 複数のモーダルが同時に開いても壊れないように数える
let saved = null; // ロック開始時の body スタイルとスクロール位置

function lock() {
  if (typeof document === "undefined") return;
  const body = document.body;
  const scrollY = window.scrollY || window.pageYOffset || 0;
  saved = {
    scrollY,
    overflow: body.style.overflow,
    position: body.style.position,
    top: body.style.top,
    left: body.style.left,
    right: body.style.right,
    width: body.style.width,
  };
  body.style.position = "fixed";
  body.style.top = `-${scrollY}px`;
  body.style.left = "0";
  body.style.right = "0";
  body.style.width = "100%";
  body.style.overflow = "hidden";
}

function unlock() {
  if (typeof document === "undefined" || !saved) return;
  const body = document.body;
  body.style.position = saved.position;
  body.style.top = saved.top;
  body.style.left = saved.left;
  body.style.right = saved.right;
  body.style.width = saved.width;
  body.style.overflow = saved.overflow;
  const y = saved.scrollY;
  saved = null;
  window.scrollTo(0, y); // 閉じたときに元の位置へ戻す
}

// active が true の間、背面のスクロールを止める
export function useBodyScrollLock(active) {
  useEffect(() => {
    if (!active) return undefined;
    if (lockCount === 0) lock();
    lockCount += 1;
    return () => {
      lockCount -= 1;
      if (lockCount === 0) unlock();
    };
  }, [active]);
}
