import { useEffect } from 'react';

// Existing arrow controls keep their normal click semantics. This enhancement
// recognizes their position in each action group and repeats that click while
// the control is held, which is especially useful on phones and tablets.
export default function LongPressReorder() {
  useEffect(() => {
    let timer = 0;
    let repeat = 0;
    let repeated = false;
    let firing = false;
    let active: HTMLButtonElement | null = null;
    const isReorder = (button: HTMLButtonElement) => {
      const group = button.closest('.order-actions, .weekly-task-actions');
      if (!group || button.disabled) return false;
      const buttons = [...group.querySelectorAll('button')];
      const index = buttons.indexOf(button);
      return group.classList.contains('order-actions') ? index < 2 : index === 1 || index === 2;
    };
    const clear = () => { window.clearTimeout(timer); window.clearInterval(repeat); timer = 0; repeat = 0; active = null; };
    const down = (event: PointerEvent) => {
      const button = (event.target as Element | null)?.closest<HTMLButtonElement>('button');
      if (!button || !isReorder(button)) return;
      active = button; repeated = false;
      timer = window.setTimeout(() => {
        if (!active) return;
        repeated = true;
        const fire = () => { if (!active) return; firing = true; active.click(); firing = false; };
        fire();
        repeat = window.setInterval(fire, 180);
      }, 420);
    };
    const click = (event: MouseEvent) => { if (repeated && !firing) { event.preventDefault(); event.stopImmediatePropagation(); repeated = false; } };
    document.addEventListener('pointerdown', down, true);
    document.addEventListener('pointerup', clear, true);
    document.addEventListener('pointercancel', clear, true);
    document.addEventListener('click', click, true);
    return () => { clear(); document.removeEventListener('pointerdown', down, true); document.removeEventListener('pointerup', clear, true); document.removeEventListener('pointercancel', clear, true); document.removeEventListener('click', click, true); };
  }, []);
  return null;
}
