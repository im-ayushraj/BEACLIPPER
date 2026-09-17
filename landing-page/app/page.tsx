import { Navbar } from "@/components/Navbar";
import { Hero } from "@/components/Hero";
import { ProblemSection } from "@/components/ProblemSection";
import { HowItWorks } from "@/components/HowItWorks";
import { AiClipperSection } from "@/components/AiClipperSection";
import { SplitVideoSection } from "@/components/SplitVideoSection";
import { AudienceAndBenefits } from "@/components/AudienceAndBenefits";
import { WaitlistSection } from "@/components/WaitlistSection";
import { FaqSection } from "@/components/FaqSection";
import { Footer } from "@/components/Footer";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#090a0f] text-white flex flex-col">
      <Navbar />
      <main className="flex-1">
        <Hero />
        <ProblemSection />
        <HowItWorks />
        <AiClipperSection />
        <SplitVideoSection />
        <AudienceAndBenefits />
        <WaitlistSection />
        <FaqSection />
      </main>
      <Footer />
    </div>
  );
}
