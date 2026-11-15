import { DownloadsSection } from "./sections/DownloadsSection";
import { EncoderSection } from "./sections/EncoderSection";
import { Hero } from "./Hero";
import { InstallSection } from "./sections/InstallSection";
import { PipelineSection } from "./sections/PipelineSection";
import { QualitySection } from "./sections/QualitySection";
import { SiteFooter } from "./SiteFooter";
import { SiteHeader } from "./SiteHeader";
import { VideoSection } from "./sections/VideoSection";

export function Home() {
    return (
        <div className="site">
            <a className="skip-link" href="#site-main">
                Skip to content
            </a>
            <SiteHeader />
            <main id="site-main">
                <Hero />
                <PipelineSection />
                <VideoSection />
                <QualitySection />
                <EncoderSection />
                <InstallSection />
                <DownloadsSection />
            </main>
            <SiteFooter />
        </div>
    );
}
