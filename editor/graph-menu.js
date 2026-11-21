// The menu a right click on <tb-machine-graph> opens: a list of buttons at the pointer, moved through with the
// arrow keys, closed by Escape, by a click outside it or by choosing one.

/**
 * Opens a menu in root at the place of ev: items are [text, act, class]. onEscape runs when Escape closes it.
 * Gives the function that closes it.
 */
export function popupMenu(root, ev, items, onEscape) {
  const menu = Object.assign(document.createElement('div'), { className: 'menu' });
  menu.setAttribute('role', 'menu');
  let outside = null;
  const close = () => {
    menu.remove();
    if (outside) document.removeEventListener('pointerdown', outside, true);
    outside = null;
  };
  for (const [text, act, cls] of items) {
    const b = Object.assign(document.createElement('button'), { type: 'button', textContent: text });
    b.setAttribute('role', 'menuitem');
    if (cls) b.className = cls;
    b.addEventListener('click', () => { close(); act(); });
    menu.append(b);
  }
  menu.addEventListener('keydown', e => {
    const bs = [...menu.querySelectorAll('button')];
    const i = bs.indexOf(root.activeElement);
    if (e.key === 'Escape') { e.preventDefault(); close(); onEscape(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); bs[(i + 1) % bs.length].focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); bs[(i - 1 + bs.length) % bs.length].focus(); }
  });
  menu.style.left = `${Math.min(ev.clientX, innerWidth - 200)}px`;
  menu.style.top = `${Math.min(ev.clientY, innerHeight - 40 * items.length - 16)}px`;
  root.append(menu);
  menu.querySelector('button').focus();
  outside = e => { if (!e.composedPath().includes(menu)) close(); };
  setTimeout(() => { if (outside) document.addEventListener('pointerdown', outside, true); });
  return close;
}
