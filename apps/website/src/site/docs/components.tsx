import {
    Children,
    createContext,
    isValidElement,
    lazy,
    Suspense,
    useContext,
    useId,
    useMemo,
    useRef,
    useState,
    type ComponentProps,
    type ComponentPropsWithoutRef,
    type ComponentType,
    type ElementType,
    type MouseEvent,
    type ReactNode,
    type RefObject,
} from "react";

import { useSiteTheme } from "../useSiteTheme";
import { isDocsCapture } from "./captures";
import { PlatformInstall } from "./install";
import { withBase } from "../../base-path";
import { useDocsNavigate } from "./navigation";
import { slugifyHeading, type DocsPage } from "./manifest";

// The live surfaces carry the chart renderer and the sample application fixtures. They are
// useful on a handful of pages, so a reader who never opens one must not download them.
const LazyLiveWidget = lazy(() =>
    import("./widgets").then((module) => ({ default: module.LiveWidget })),
);
const LazyLiveSample = lazy(() =>
    import("@av1ation/ui/docs-widgets").then((module) => ({ default: module.DocsSample })),
);
const LazyForkParameterTables = lazy(() =>
    import("./forks").then((module) => ({ default: module.ForkParameterTables })),
);

function LiveWidget(props: ComponentProps<typeof LazyLiveWidget>) {
    return (
        <Suspense fallback={<p className="docs-loading">Loading the sample widget…</p>}>
            <LazyLiveWidget {...props} />
        </Suspense>
    );
}

function LiveSample(props: ComponentProps<typeof LazyLiveSample>) {
    return (
        <Suspense fallback={<p className="docs-loading">Loading the live sample…</p>}>
            <LazyLiveSample {...props} />
        </Suspense>
    );
}

function ForkParameterTables() {
    return (
        <Suspense fallback={<p className="docs-loading">Loading the parameter tables…</p>}>
            <LazyForkParameterTables />
        </Suspense>
    );
}

function textOf(node: ReactNode): string {
    if (typeof node === "string" || typeof node === "number") {
        return String(node);
    }
    if (Array.isArray(node)) {
        return node.map(textOf).join("");
    }
    if (isValidElement<{ children?: ReactNode }>(node)) {
        return textOf(node.props.children);
    }
    return "";
}

/** A page-level heading that can receive focus after a client-side navigation. */
export function DocsPageHeading({ children }: { children: ReactNode }) {
    return (
        <h1 id="docs-title" tabIndex={-1} className="docs-article__title">
            {children}
        </h1>
    );
}

export function DocsPageHeader({ page }: { page: DocsPage }) {
    return <DocsPageHeading>{page.title}</DocsPageHeading>;
}

export function DocsArticle({
    page,
    children,
}: {
    page: DocsPage;
    children: ReactNode;
}) {
    return (
        <article className="docs-article" aria-labelledby="docs-title">
            <p className="docs-article__eyebrow">{page.id}</p>
            <DocsPageHeader page={page} />
            <p className="docs-article__lede">{page.description}</p>
            {children}
        </article>
    );
}

const StepContext = createContext(0);

export function Steps({ children }: { children: ReactNode }) {
    const steps = Children.toArray(children).filter((child) => isValidElement(child));
    return (
        <div className="docs-steps">
            {steps.map((child, index) => (
                <StepContext.Provider key={index} value={index + 1}>
                    {child}
                </StepContext.Provider>
            ))}
        </div>
    );
}

export function Step({
    title,
    children,
    result,
}: {
    title: string;
    children: ReactNode;
    /** The expected result is visible, not buried in prose. */
    result?: ReactNode;
}) {
    const number = useContext(StepContext);
    const id = slugifyHeading(title);
    return (
        <section className="docs-step" aria-labelledby={id}>
            <h2 id={id} className="docs-step__title">
                <span className="docs-step__number" aria-hidden="true">
                    {number}
                </span>
                {title}
            </h2>
            <div className="docs-step__body">{children}</div>
            {result === undefined ? null : (
                <p className="docs-step__result">
                    <strong>Expected result:</strong> {result}
                </p>
            )}
        </section>
    );
}

export function Callout({
    tone = "note",
    title,
    children,
}: {
    tone?: "note" | "tip" | "warning" | "danger";
    title?: string;
    children: ReactNode;
}) {
    return (
        <aside className={`docs-callout docs-callout--${tone}`} data-tone={tone}>
            {title === undefined ? null : <p className="docs-callout__title">{title}</p>}
            <div className="docs-callout__body">{children}</div>
        </aside>
    );
}

export function Figure({
    capture,
    alt,
    caption,
    scope,
    fullSurface = false,
}: {
    capture: string;
    alt: string;
    caption: ReactNode;
    /** Names the visible app scope when the figure is a crop or a page state. */
    scope?: string;
    fullSurface?: boolean;
}) {
    const theme = useSiteTheme();
    const [loaded, setLoaded] = useState(false);
    if (!isDocsCapture(capture)) {
        throw new Error(`The docs figure "${capture}" is not a gallery capture.`);
    }
    const source = withBase(`/docs-shots/${capture}-${theme}.avif`);
    return (
        <figure className="docs-figure" data-capture={capture}>
            <a
                className="docs-figure__frame"
                href={source}
                target="_blank"
                rel="noreferrer"
                aria-label={`Open the full ${alt.toLowerCase()} capture in a new tab`}
            >
                <img
                    src={source}
                    alt={alt}
                    width={1280}
                    height={720}
                    loading="lazy"
                    decoding="async"
                    data-loaded={loaded ? "true" : "false"}
                    onLoad={() => setLoaded(true)}
                />
            </a>
            <figcaption className="docs-figure__caption">
                {scope === undefined ? null : <span className="docs-figure__scope">{scope} · </span>}
                {caption}
                <span className="docs-figure__link">
                    {fullSurface
                        ? " Full application surface."
                        : " Select the image for the native-size capture."}
                </span>
            </figcaption>
        </figure>
    );
}

export function Key({ children }: { children: ReactNode }) {
    return <kbd className="docs-key">{children}</kbd>;
}

function isApplePlatform(): boolean {
    if (typeof navigator === "undefined") {
        return false;
    }
    return /Mac|iPhone|iPad/u.test(navigator.platform);
}

export function KeySequence({ keys }: { keys: readonly string[] }) {
    const apple = isApplePlatform();
    const rendered = keys.map((key) => {
        if (!apple) {
            return key;
        }
        if (key === "Ctrl") {
            return "⌘";
        }
        if (key === "Alt") {
            return "⌥";
        }
        if (key === "Shift") {
            return "⇧";
        }
        return key;
    });
    return (
        <span className="docs-key-sequence" role="group" aria-label={`Keyboard shortcut ${keys.join(" plus ")}`}>
            {rendered.map((key, index) => (
                <span key={`${key}-${index}`}>
                    {index > 0 ? <span aria-hidden="true"> + </span> : null}
                    <Key>{key}</Key>
                </span>
            ))}
        </span>
    );
}

export function FieldTable({ children, caption }: { children: ReactNode; caption?: string }) {
    return (
        <div className="docs-field-table" role="region" aria-label={caption ?? "Field reference"} tabIndex={0}>
            {children}
        </div>
    );
}

export function RelatedLinks({ children }: { children: ReactNode }) {
    return (
        <nav className="docs-related" aria-label="Related reference">
            <h2 id="related-reference">Related reference</h2>
            <ul>{children}</ul>
        </nav>
    );
}

function CopyButton({ target }: { target: RefObject<HTMLPreElement | null> }) {
    const [copied, setCopied] = useState(false);
    const copy = (): void => {
        const text = target.current?.textContent ?? "";
        void navigator.clipboard?.writeText(text).then(() => {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1500);
        });
    };
    return (
        <button type="button" className="docs-code__copy" onClick={copy}>
            {copied ? "Copied" : "Copy"}
        </button>
    );
}

export function CodeBlock({ children, ...props }: ComponentPropsWithoutRef<"pre">) {
    const ref = useRef<HTMLPreElement>(null);
    return (
        <div className="docs-code">
            <CopyButton target={ref} />
            <pre ref={ref} {...props}>
                {children}
            </pre>
        </div>
    );
}

export function MdxLink({ href = "", children, ...props }: ComponentPropsWithoutRef<"a">) {
    const navigate = useDocsNavigate();
    const internal = href.startsWith("/docs") && !href.startsWith("/docs-shots/");
    const resolved = internal ? withBase(href) : href;
    const onClick = (event: MouseEvent<HTMLAnchorElement>): void => {
        if (!internal) {
            return;
        }
        if (event.defaultPrevented || event.button !== 0) {
            return;
        }
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
            return;
        }
        event.preventDefault();
        navigate(href);
    };
    return (
        <a href={resolved} onClick={onClick} {...props}>
            {children}
        </a>
    );
}

function MdxHeading({
    as: Tag,
    children,
    ...props
}: ComponentPropsWithoutRef<"h2"> & { as: "h2" | "h3" }) {
    const label = textOf(children);
    const id = slugifyHeading(label) || undefined;
    return (
        <Tag id={id} {...props}>
            {children}
        </Tag>
    );
}

export function MdxTable({ children, ...props }: ComponentPropsWithoutRef<"table">) {
    return (
        <FieldTable caption="Reference table">
            <table {...props}>{children}</table>
        </FieldTable>
    );
}

/**
 * The complete component vocabulary MDX may use. Nothing outside this map is available to
 * a page, so content cannot reach into application internals or mount an arbitrary route.
 */
export const DOCS_COMPONENTS: Record<string, ElementType> = {
    h2: (props: ComponentPropsWithoutRef<"h2">) => <MdxHeading as="h2" {...props} />,
    h3: (props: ComponentPropsWithoutRef<"h3">) => <MdxHeading as="h3" {...props} />,
    a: MdxLink,
    pre: CodeBlock,
    table: MdxTable,
    Steps,
    Step,
    Callout,
    Figure,
    Key,
    KeySequence,
    FieldTable,
    RelatedLinks,
    PlatformInstall,
    LiveWidget,
    LiveSample,
    ForkParameterTables,
    DocsPage: DocsPageHeader as ComponentType,
    DocsPageHeading,
};

export function DocsPageComponent({ children }: { children: ReactNode }) {
    return <>{children}</>;
}

/** A stable key for the lazy MDX component of a page. */
export function usePageKey(page: DocsPage): string {
    return useMemo(() => `docs-${page.id.toLowerCase()}`, [page.id]);
}

export function usePageAnchorId(): string {
    const id = useId();
    return id;
}
