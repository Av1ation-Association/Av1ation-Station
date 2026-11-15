import { LogoMark } from "@av1ation/ui/logo-mark";

/**
 * The GitHub banner's lockup, rebuilt in the page instead of placed as an image.
 *
 * The mark sits at the right, the contrails run left through the gap between the two
 * wordmark lines, and the mark keeps its 153:180 planform. The animation is CSS-only: the
 * mark starts at the page centre and slides into place, then the trails grow out of its
 * engines and the words converge on the gap.
 */
export function BrandLockup() {
    return (
        <div className="brand-lockup" role="img" aria-label="Av1ation Station">
            <div className="brand-lockup__body" aria-hidden="true">
                <div className="brand-lockup__trails">
                    <span className="brand-lockup__trail brand-lockup__trail--upper" />
                    <span className="brand-lockup__trail brand-lockup__trail--lower" />
                </div>
                <div className="brand-lockup__words">
                    <span className="brand-lockup__word brand-lockup__word--av1ation">
                        Av1ation
                    </span>
                    <span className="brand-lockup__word brand-lockup__word--station">Station</span>
                </div>
                <LogoMark className="brand-lockup__mark" />
            </div>
        </div>
    );
}
