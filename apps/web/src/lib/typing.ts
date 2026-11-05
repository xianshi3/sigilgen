/**
 * Whether a key press or menu command belongs to a field rather than to the studio.
 *
 * The desktop menu and the keyboard shortcuts both need this answer, and both must give the same one:
 * `Cmd/Ctrl+Z` in the brand-name box is "undo my typing", not "undo my last edit to a path".
 */

/**
 * Whether an event target is a control the reader is typing into.
 *
 * `isContentEditable` is read off the element rather than inferred, because a rich-text host may set it
 * on an ancestor rather than on the node that received the press.
 *
 * @param target - The event target, or the current focus.
 * @returns `true` when the key is for the field, not for the app.
 */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false
  }
  const tag = target.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
    return true
  }
  return target.isContentEditable === true
}
