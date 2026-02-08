import { useCallback, useEffect, useMemo, useState } from 'react'

export type VirtualAlign = 'nearest' | 'start' | 'end' | 'center'

export interface VirtualListRange {
    startIndex: number
    endIndex: number
    topSpacerHeight: number
    bottomSpacerHeight: number
}

export interface UseVirtualListOptions<T extends HTMLElement> {
    enabled: boolean
    itemCount: number
    scrollElementRef: React.RefObject<T>
    itemSelector: string
    overscan?: number
    estimateItemStride?: number
}

export function useVirtualList<T extends HTMLElement>({
    enabled,
    itemCount,
    scrollElementRef,
    itemSelector,
    overscan = 6,
    estimateItemStride = 36,
}: UseVirtualListOptions<T>) {
    const [scrollTop, setScrollTop] = useState(0)
    const [viewportHeight, setViewportHeight] = useState(0)
    const [itemStride, setItemStride] = useState(estimateItemStride)
    const [baseOffset, setBaseOffset] = useState(0)

    useEffect(() => {
        const el = scrollElementRef.current
        if (!enabled || !el) return

        let raf = 0
        const onScroll = () => {
            if (raf) return
            raf = window.requestAnimationFrame(() => {
                raf = 0
                setScrollTop(el.scrollTop)
            })
        }

        setScrollTop(el.scrollTop)
        el.addEventListener('scroll', onScroll, { passive: true })
        return () => {
            el.removeEventListener('scroll', onScroll)
            if (raf) window.cancelAnimationFrame(raf)
        }
    }, [enabled, scrollElementRef])

    useEffect(() => {
        const el = scrollElementRef.current
        if (!enabled || !el) return

        const update = () => setViewportHeight(el.clientHeight)
        update()

        const ro = new ResizeObserver(update)
        ro.observe(el)
        return () => ro.disconnect()
    }, [enabled, scrollElementRef])

    const range = useMemo((): VirtualListRange => {
        if (!enabled) {
            return {
                startIndex: 0,
                endIndex: itemCount - 1,
                topSpacerHeight: 0,
                bottomSpacerHeight: 0,
            }
        }
        if (itemCount <= 0) {
            return { startIndex: 0, endIndex: -1, topSpacerHeight: 0, bottomSpacerHeight: 0 }
        }

        const y = scrollTop - baseOffset
        const rawStart = Math.floor(y / itemStride) - overscan
        const rawEnd = Math.ceil((y + viewportHeight) / itemStride) + overscan

        const startIndex = Math.max(0, Math.min(itemCount - 1, rawStart))
        const endIndex = Math.max(startIndex, Math.min(itemCount - 1, rawEnd))

        return {
            startIndex,
            endIndex,
            topSpacerHeight: startIndex * itemStride,
            bottomSpacerHeight: Math.max(0, (itemCount - endIndex - 1) * itemStride),
        }
    }, [enabled, itemCount, scrollTop, baseOffset, itemStride, viewportHeight, overscan])

    useEffect(() => {
        const el = scrollElementRef.current
        if (!enabled || !el || itemCount <= 1) return

        const nodes = el.querySelectorAll<HTMLElement>(itemSelector)
        if (nodes.length === 0) return

        const first = nodes[0]
        const second = nodes.length >= 2 ? nodes[1] : null

        const nextStride =
            second && second.offsetTop > first.offsetTop
                ? second.offsetTop - first.offsetTop
                : first.offsetHeight || itemStride

        const nextBase = Number.isFinite(Number(first.dataset.index))
            ? first.offsetTop - Number(first.dataset.index) * nextStride
            : baseOffset

        if (nextStride > 0 && Math.abs(nextStride - itemStride) > 1) {
            setItemStride(nextStride)
        }
        if (Number.isFinite(nextBase) && Math.abs(nextBase - baseOffset) > 1) {
            setBaseOffset(nextBase)
        }
    }, [enabled, scrollElementRef, itemCount, itemSelector, itemStride, baseOffset, range.startIndex, range.endIndex])

    const scrollToIndex = useCallback(
        (index: number, align: VirtualAlign = 'nearest') => {
            const el = scrollElementRef.current
            if (!el || index < 0 || index >= itemCount) return

            const top = baseOffset + index * itemStride
            const bottom = top + itemStride

            if (align === 'start') {
                el.scrollTop = top
                return
            }
            if (align === 'end') {
                el.scrollTop = bottom - el.clientHeight
                return
            }
            if (align === 'center') {
                el.scrollTop = top - (el.clientHeight - itemStride) / 2
                return
            }

            // nearest
            const viewTop = el.scrollTop
            const viewBottom = viewTop + el.clientHeight
            if (top < viewTop) {
                el.scrollTop = top
            } else if (bottom > viewBottom) {
                el.scrollTop = bottom - el.clientHeight
            }
        },
        [scrollElementRef, itemCount, baseOffset, itemStride],
    )

    return {
        enabled,
        itemStride,
        baseOffset,
        scrollTop,
        viewportHeight,
        ...range,
        scrollToIndex,
    }
}

