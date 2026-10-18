import { useEffect, useState } from "react";

/** Window widths of the editor layout. */
export const COMPACT = "(max-width: 1023px)";
export const PHONE = "(max-width: 599px)";

/** True while the media query matches. */
export function useMedia(query: string): boolean {
  const [on, setOn] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const change = () => setOn(mq.matches);
    change();
    mq.addEventListener("change", change);
    return () => mq.removeEventListener("change", change);
  }, [query]);
  return on;
}
