import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RefObject, UIEvent } from "react";

interface UseVirtualListOptions {
  itemCount: number;
  itemHeight: number;
  overscan?: number;
  enabled?: boolean;
}

interface UseVirtualListResult {
  containerRef: RefObject<HTMLDivElement | null>;
  handleScroll: (event: UIEvent<HTMLDivElement>) => void;
  startIndex: number;
  endIndex: number;
  offsetTop: number;
  offsetBottom: number;
}

/**
 * Fenêtrage léger pour listes/tableaux à hauteur de ligne fixe.
 * On garde le markup existant (table/list) et on remplace les lignes
 * hors-écran par des spacers pour limiter le nombre de noeuds montés.
 */
export function useVirtualList({
  itemCount,
  itemHeight,
  overscan = 6,
  enabled = true,
}: UseVirtualListOptions): UseVirtualListResult {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);

  const measureViewport = useCallback(() => {
    const nextHeight = containerRef.current?.clientHeight ?? 0;
    setViewportHeight((current) =>
      current === nextHeight ? current : nextHeight,
    );
  }, []);

  useEffect(() => {
    if (!enabled) {
      setScrollTop(0);
      setViewportHeight(0);
      return;
    }

    const element = containerRef.current;
    if (!element) return;

    measureViewport();

    const observer =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => measureViewport())
        : null;
    observer?.observe(element);
    window.addEventListener("resize", measureViewport);

    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measureViewport);
    };
  }, [enabled, measureViewport]);

  useEffect(() => {
    if (!enabled || viewportHeight <= 0) return;

    const maxScrollTop = Math.max(0, itemCount * itemHeight - viewportHeight);
    setScrollTop((current) => Math.min(current, maxScrollTop));
  }, [enabled, itemCount, itemHeight, viewportHeight]);

  const handleScroll = useCallback(
    (event: UIEvent<HTMLDivElement>) => {
      if (!enabled) return;
      setScrollTop(event.currentTarget.scrollTop);
    },
    [enabled],
  );

  return useMemo(() => {
    if (!enabled || itemCount === 0) {
      return {
        containerRef,
        handleScroll,
        startIndex: 0,
        endIndex: itemCount,
        offsetTop: 0,
        offsetBottom: 0,
      };
    }

    const fallbackViewport = itemHeight * Math.min(itemCount, 12);
    const effectiveViewport = viewportHeight > 0 ? viewportHeight : fallbackViewport;
    const visibleCount = Math.max(1, Math.ceil(effectiveViewport / itemHeight));
    const startIndex = Math.max(
      0,
      Math.floor(scrollTop / itemHeight) - overscan,
    );
    const endIndex = Math.min(
      itemCount,
      startIndex + visibleCount + overscan * 2,
    );

    return {
      containerRef,
      handleScroll,
      startIndex,
      endIndex,
      offsetTop: startIndex * itemHeight,
      offsetBottom: Math.max(0, (itemCount - endIndex) * itemHeight),
    };
  }, [
    enabled,
    handleScroll,
    itemCount,
    itemHeight,
    overscan,
    scrollTop,
    viewportHeight,
  ]);
}
