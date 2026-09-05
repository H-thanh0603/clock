"use client";

import { useEffect } from "react";
import { Icon } from "@iconify/react";
import { Syncopate } from "next/font/google";

const syncopate = Syncopate({
  subsets: ["latin"],
  weight: ["400", "700"],
  display: "swap",
});

export default function Page() {
  useEffect(() => {
    const links = document.querySelectorAll<HTMLAnchorElement>(".transition-link");

    const handler = (e: Event) => {
      e.preventDefault();
      if (!document.startViewTransition) {
        window.location.reload();
        return;
      }

      document.startViewTransition(() => {
        document.body.style.opacity = "0.9";
        document.body.style.transform = "scale(0.99)";
        window.setTimeout(() => {
          document.body.style.opacity = "1";
          document.body.style.transform = "scale(1)";
        }, 150);
      });
    };

    links.forEach((link) => link.addEventListener("click", handler));

    return () => {
      links.forEach((link) => link.removeEventListener("click", handler));
    };
  }, []);

  return (
    <div
      className={`${syncopate.className} min-h-screen overflow-x-hidden bg-[oklch(15%_0.02_280)] text-[oklch(95%_0.01_240)] antialiased selection:bg-[oklch(65%_0.25_45)] selection:text-[oklch(15%_0.02_280)]`}
    >
      <div className="optical-flare pointer-events-none fixed left-[-40vw] top-[-30vh] z-0 h-[180vh] w-[180vw]" />

      <div className="kinetic-anchor">
        <video autoPlay loop muted playsInline className="h-full w-full object-cover">
          <source src="/swiss-luxury-watches-and-chronographs/video.mp4" type="video/mp4" />
        </video>
      </div>

      <main className="relative z-10 mx-auto container px-8 pb-40 pt-32">
        <section className="flex min-h-[85vh] max-w-5xl flex-col justify-center">
          <div className="lens-refraction mb-10 inline-block w-max max-w-full -skew-x-3 p-16">
            <h1 className="bg-gradient-to-r from-white via-gray-400 to-[oklch(65%_0.25_45)] bg-clip-text text-6xl font-bold uppercase leading-none tracking-tighter text-transparent md:text-8xl">
              Orange Sapphire.
              <br />
              <span className="glow-text text-5xl font-light text-white md:text-7xl">Absolute Fusion.</span>
            </h1>
          </div>

          <p className="mt-4 max-w-3xl skew-x-2 text-xl font-light leading-relaxed text-gray-300 md:text-2xl">
            Witness the apex of materials engineering. Unibody sapphire construction fused with sub-millisecond
            escapement precision. A geometric breach in traditional horology.
          </p>

          <div className="mt-16 flex items-center gap-8">
            <button className="magnetic-liquid transition-link flex items-center gap-4 px-12 py-6 text-sm font-bold uppercase tracking-widest">
              Engage Caliber
              <Icon icon="ph:arrow-right-bold" className="text-2xl" />
            </button>

            <button className="lens-refraction px-12 py-6 text-sm font-light uppercase tracking-widest transition-colors hover:bg-white/5">
              Read Telemetry
            </button>
          </div>
        </section>

        <section className="scroll-assembly mt-40 grid items-center gap-12 hex-hub @container lg:grid-cols-[1.05fr_.95fr]">
          <div className="flex flex-col gap-16 relative">
            <div className="lens-refraction lens-refraction-hex bg-[oklch(15%_0.02_280_/_0.4)] p-16 backdrop-blur-3xl transition-transform duration-1000 hover:scale-105">
              <Icon icon="mdi:cog-transfer" className="mb-8 text-5xl text-[oklch(65%_0.25_45)] animate-pulse" />
              <h3 className="mb-4 text-2xl font-bold uppercase tracking-wider syncopate">
                Tourbillon Synchronization
              </h3>
              <p className="text-sm font-light leading-relaxed tracking-wide text-gray-400">
                Gravitational displacement eradicated. The floating hexagonal cage ensures sub-millisecond escapement
                precision regardless of the spatial vector.
              </p>
            </div>

            <div className="lens-refraction lens-refraction-hex ml-12 bg-[oklch(15%_0.02_280_/_0.4)] p-16 backdrop-blur-3xl transition-transform duration-1000 hover:scale-105">
              <Icon icon="mdi:battery-charging-high" className="mb-8 text-5xl text-[oklch(65%_0.25_45)]" />
              <h3 className="mb-4 text-2xl font-bold uppercase tracking-wider syncopate">
                72-H Power Telemetry
              </h3>
              <p className="text-sm font-light leading-relaxed tracking-wide text-gray-400">
                Advanced mainspring architecture. Monitor energy reservoirs through the skeletal dial, driven by a
                self-winding neuro-mechanical rotor.
              </p>
            </div>
          </div>

          <div className="lens-refraction group relative flex min-h-[700px] flex-col justify-between overflow-hidden border-l-2 border-l-[oklch(65%_0.25_45_/_0.3)] p-16">
            <div className="absolute inset-0 bg-gradient-to-br from-[oklch(65%_0.25_45_/_0.1)] to-transparent opacity-0 transition-opacity duration-1000 group-hover:opacity-100" />
            <div className="relative z-10 flex justify-end">
              <Icon
                icon="mdi:hexagon-outline"
                className="animate-spin-slow text-7xl text-[oklch(65%_0.25_45)] opacity-20 transition-opacity duration-700 group-hover:opacity-80"
              />
            </div>
            <div className="relative z-10">
              <h2 className="mb-6 text-4xl font-bold uppercase tracking-tight syncopate">
                Orange Ceramic Anodization
              </h2>
              <p className="text-lg font-light leading-relaxed text-gray-300">
                Through intense thermal plasma and pressure synthesis, the raw structure achieves a vibrant,
                indestructible exterior. Physicality elevated to high-fidelity art.
              </p>
            </div>
          </div>
        </section>

        <section className="mt-64">
          <div className="relative mx-auto flex max-w-6xl flex-col items-center overflow-hidden rounded-[24px] border border-white/10 bg-[rgba(255,255,255,0.03)] p-24 text-center shadow-[0_30px_80px_-20px_rgba(0,0,0,0.9)] md:p-32">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,_oklch(65%_0.25_45_/_0.18),_transparent_60%)]" />
            <div className="relative z-10 flex flex-col items-center">
              <Icon icon="mdi:rhombus-split-outline" className="mb-12 text-8xl text-[oklch(65%_0.25_45)]" />
              <h2 className="glow-text mb-8 text-5xl font-bold uppercase tracking-tighter syncopate md:text-7xl">
                Architect Time
              </h2>
              <p className="mx-auto mb-16 max-w-2xl text-xl font-light tracking-wide text-gray-400">
                No containers. No boundaries. Only the pure geometry of horological perfection.
              </p>
              <button className="magnetic-liquid px-16 py-8 text-xl font-bold uppercase tracking-widest">
                Acquire Masterpiece
              </button>
            </div>
          </div>
        </section>
      </main>

      <style jsx global>{`
        :root {
          --deep-obsidian: oklch(15% 0.02 280);
          --safety-orange: oklch(65% 0.25 45);
          --titanium-white: oklch(95% 0.01 240);
          --flare-orange: radial-gradient(circle at 50% 50%, oklch(65% 0.25 45 / 0.18), transparent 60%);
        }

        html {
          scroll-behavior: smooth;
        }

        body {
          margin: 0;
          padding: 0;
          overflow-x: hidden;
          background-color: var(--deep-obsidian);
          color: var(--titanium-white);
          view-transition-name: root;
        }

        ::view-transition-old(root),
        ::view-transition-new(root) {
          animation-duration: 0.9s;
          animation-timing-function: cubic-bezier(0.16, 1, 0.3, 1);
        }

        .kinetic-anchor {
          position: fixed;
          top: 5vh;
          right: -10vw;
          width: 75vw;
          height: 95vh;
          z-index: 0;
          pointer-events: none;
          opacity: 0.85;
          transform-style: preserve-3d;
          animation: tourbillon-float 24s cubic-bezier(0.25, 0.1, 0.25, 1) infinite alternate;
          filter: drop-shadow(0 0 30px oklch(65% 0.25 45 / 0.3));
          -webkit-mask-image: radial-gradient(circle at 50% 50%, black 31%, transparent 63%);
          mask-image: radial-gradient(circle at 50% 50%, black 31%, transparent 63%);
        }

        .kinetic-anchor video {
          width: 100%;
          height: 100%;
          object-fit: cover;
          transform: scale(1.3) rotate(-5deg);
          filter: contrast(1.15) brightness(1.05);
        }

.lens-refraction {
  background: color-mix(in oklch, var(--titanium-white) 2%, transparent);
  backdrop-filter: blur(28px) brightness(1.05);
  -webkit-backdrop-filter: blur(28px) brightness(1.05);
}

        .lens-refraction-hex {
          clip-path: polygon(50% 0%, 100% 20%, 100% 80%, 50% 100%, 0% 80%, 0% 20%);
          border-radius: 0;
        }

        .magnetic-liquid {
          background: transparent;
          color: var(--safety-orange);
          position: relative;
          transition: all 0.5s cubic-bezier(0.16, 1, 0.3, 1);
          border: 1px solid var(--safety-orange);
          clip-path: polygon(10% 0, 100% 0, 90% 100%, 0 100%);
          overflow: hidden;
          z-index: 1;
        }

        .magnetic-liquid::before {
          content: "";
          position: absolute;
          top: 100%;
          left: 0;
          width: 100%;
          height: 100%;
          background: var(--safety-orange);
          z-index: -1;
          transition: top 0.4s cubic-bezier(0.16, 1, 0.3, 1);
        }

        .magnetic-liquid:hover {
          color: var(--deep-obsidian);
          transform: translateY(-3px) scale(1.03);
          box-shadow: 0 15px 40px oklch(65% 0.25 45 / 0.4);
        }

        .magnetic-liquid:hover::before {
          top: 0;
        }

        .optical-flare {
          background: var(--flare-orange);
          z-index: -1;
          pointer-events: none;
          filter: blur(120px);
          mix-blend-mode: screen;
        }

        @keyframes tourbillon-float {
          0% {
            transform: translateY(0) rotateZ(0deg) rotateX(2deg) rotateY(-3deg) scale(1);
          }
          50% {
            transform: translateY(-20px) rotateZ(1deg) rotateX(-1deg) rotateY(1deg) scale(1.02);
          }
          100% {
            transform: translateY(-40px) rotateZ(-1deg) rotateX(-2deg) rotateY(4deg) scale(1.04);
          }
        }

        @keyframes atomic-assembly {
          from {
            opacity: 0;
            transform: translateY(150px) scale(0.9) rotateX(-15deg) rotateY(10deg);
            filter: blur(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1) rotateX(0deg) rotateY(0deg);
            filter: blur(0);
          }
        }

        .scroll-assembly {
          animation: atomic-assembly linear both;
          animation-timeline: view();
          animation-range: entry 5% cover 40%;
          transform-style: preserve-3d;
        }

        .hex-hub {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
          gap: 3rem;
          align-items: center;
        }

        .glow-text {
          text-shadow: 0 0 30px oklch(65% 0.25 45 / 0.6);
        }

        .animate-spin-slow {
          animation: spin 16s linear infinite;
        }

        @keyframes spin {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </div>
  );
}