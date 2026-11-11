import { useEffect, useState } from "react";

/**
 * One cached keyframe, or the empty box that reserves its place.
 *
 * The rail and the timeline both draw this, so a building cache never changes row height
 * and a failed file disappears instead of showing a browser's broken-image glyph. The image
 * is decorative: the row's frame range and the block's label already name the scene.
 */
export function SceneStill({
    src,
    className = "",
}: {
    src: string | null;
    className?: string | undefined;
}) {
    const [failed, setFailed] = useState(false);
    useEffect(() => {
        setFailed(false);
    }, [src]);
    if (src === null || failed) {
        return <span aria-hidden="true" className={`${className} block bg-sunken`} />;
    }
    return (
        <img
            src={src}
            alt=""
            aria-hidden="true"
            draggable={false}
            loading="lazy"
            decoding="async"
            onError={() => setFailed(true)}
            className={`${className} object-cover`}
        />
    );
}
