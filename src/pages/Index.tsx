import Navigation from "@/components/Navigation";
import Hero from "@/components/Hero";
import Skills from "@/components/Skills";
import Experience from "@/components/Experience";
import Education from "@/components/Education";
import Contact from "@/components/Contact";
import Footer from "@/components/Footer";

const Index = () => {
  return (
    <div className="min-h-screen">
      <Navigation />
      <main className="wrap"><Hero />
      <div id="experience">
        <Experience />
      </div>
      <div id="skills"><Skills /></div>
      <div id="education">
        <Education />
      </div>
      <div id="contact">
        <Contact />
      </div>
      </main>
      <Footer />
    </div>
  );
};

export default Index;
