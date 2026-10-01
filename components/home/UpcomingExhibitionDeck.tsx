"use client";

import { useRef } from "react";
import Link from "next/link";
import { ArrowRight, CalendarDays, MapPin } from "lucide-react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { daysUntilStart, formatEventDate, getEventStatus } from "@/lib/exhibitions/dates";
import type { Exhibition } from "@/lib/exhibitions/types";

gsap.registerPlugin(ScrollTrigger, useGSAP);

const visibleLayers = 5;
const depth = [
  { opacity: 1, brightness: 1, scale: 1, rotateX: 0, rotateZ: 0, z: 0 },
  { opacity: 0.95, brightness: 0.9, scale: 0.975, rotateX: 2, rotateZ: -0.7, z: -25 },
  { opacity: 0.75, brightness: 0.85, scale: 0.95, rotateX: 4, rotateZ: -1.1, z: -50 },
  { opacity: 0.5, brightness: 0.85, scale: 0.925, rotateX: 6, rotateZ: -1.5, z: -75 },
  { opacity: 0.3, brightness: 1, scale: 0.9, rotateX: 8, rotateZ: -1.9, z: -100 },
];

function pose(relative: number, step: number) {
  if (relative < 0) return {
    y: relative * Math.min(118, step), opacity: Math.max(0, 1 + relative),
    brightness: 1, scale: 1 + relative * 0.04, rotateX: 0, rotateZ: 0, z: 0,
    blur: Math.min(4, -relative * 4),
  };
  const lower = Math.min(visibleLayers - 1, Math.floor(relative));
  const upper = Math.min(visibleLayers - 1, lower + 1);
  const fraction = relative - lower;
  const from = depth[lower];
  const to = depth[upper];
  const mix = (a: number, b: number) => a + (b - a) * fraction;
  return {
    y: relative * step,
    opacity: relative > visibleLayers - 1 ? Math.max(0, visibleLayers - relative) * from.opacity : mix(from.opacity, to.opacity),
    brightness: mix(from.brightness, to.brightness),
    scale: mix(from.scale, to.scale),
    rotateX: mix(from.rotateX, to.rotateX),
    rotateZ: mix(from.rotateZ, to.rotateZ),
    z: mix(from.z, to.z),
    blur: 0,
  };
}

export function UpcomingExhibitionDeck({ exhibitions, asOf }: { exhibitions: Exhibition[]; asOf: string }) {
  const scroller = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const cards = useRef<Array<HTMLElement | null>>([]);
  const goToIndex = useRef<(index: number) => void>(() => undefined);
  const exhibitionKeys = exhibitions.map((item) => item.id).join("|");

  useGSAP(() => {
    const area = scroller.current;
    if (!area || !track.current || exhibitions.length < 2) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      cards.current.forEach((node) => {
        node?.setAttribute("aria-hidden", "false");
        const select = node?.querySelector<HTMLButtonElement>(".deck-card-select");
        if (select) select.tabIndex = 0;
      });
      goToIndex.current = (index) => cards.current[index]?.scrollIntoView({ block: "nearest" });
      return;
    }
    const nodes = cards.current.slice(0, exhibitions.length);
    const viewport = area.querySelector<HTMLElement>(".home-deck-viewport");
    let previousStart = 0;
    let previousEnd = -1;
    let scrollTween: gsap.core.Tween | null = null;

    const update = (progress: number) => {
      const cardHeight = nodes[0]?.offsetHeight ?? 285;
      const step = Math.min(138, Math.max(92, ((viewport?.clientHeight ?? 740) - cardHeight) / (visibleLayers - 1)));
      const active = progress * (exhibitions.length - 1);
      const start = Math.max(0, Math.floor(active) - 1);
      const end = Math.min(exhibitions.length - 1, Math.floor(active) + visibleLayers);
      for (let index = previousStart; index <= previousEnd; index++) {
        if (index < start || index > end) {
          const node = nodes[index];
          if (node) {
            gsap.set(node, { visibility: "hidden", pointerEvents: "none" });
            node.setAttribute("aria-hidden", "true");
            const select = node.querySelector<HTMLButtonElement>(".deck-card-select");
            const link = node.querySelector<HTMLAnchorElement>(".deck-card-link");
            if (select) select.tabIndex = -1;
            if (link) link.tabIndex = -1;
          }
        }
      }
      for (let index = start; index <= end; index++) {
        const node = nodes[index];
        if (!node) continue;
        const relative = index - active;
        const state = pose(relative, step);
        const hidden = relative <= -1 || relative >= visibleLayers;
        gsap.set(node, {
          y: state.y, z: state.z, scale: state.scale, rotateX: state.rotateX, rotation: state.rotateZ,
          opacity: state.opacity, filter: `brightness(${state.brightness}) blur(${state.blur}px)`,
          zIndex: exhibitions.length - index,
          visibility: hidden ? "hidden" : "visible",
          pointerEvents: hidden || relative < -0.35 ? "none" : "auto",
          willChange: relative > -1 && relative < 2 ? "transform, opacity, filter" : "auto",
        });
        node.setAttribute("aria-hidden", hidden ? "true" : "false");
        const select = node.querySelector<HTMLButtonElement>(".deck-card-select");
        const link = node.querySelector<HTMLAnchorElement>(".deck-card-link");
        if (select) select.tabIndex = hidden ? -1 : 0;
        const full = node.querySelector(".deck-card-full");
        const summary = node.querySelector(".deck-card-summary");
        const fullOpacity = Math.max(0, Math.min(1, 1 - relative * 1.5));
        if (full) gsap.set(full, { opacity: fullOpacity });
        if (summary) gsap.set(summary, { opacity: 1 - fullOpacity });
        if (link) link.tabIndex = !hidden && fullOpacity > 0.5 ? 0 : -1;
        const label = node.querySelector(".deck-card-label-text");
        if (label) label.textContent = relative < 0.5 ? "Next Exhibition" : "Following Exhibition";
      }
      previousStart = start;
      previousEnd = end;
    };

    update(0);
    const trigger = ScrollTrigger.create({
      trigger: track.current,
      scroller: area,
      start: "top top+=118",
      end: "bottom bottom",
      invalidateOnRefresh: true,
      onUpdate: (self) => update(self.progress),
      onRefresh: (self) => update(self.progress),
    });
    goToIndex.current = (index) => {
      const destination = Math.max(0, Math.min(exhibitions.length - 1, index));
      const maxScroll = area.scrollHeight - area.clientHeight;
      if (maxScroll <= 0) return;
      const target = maxScroll * destination / (exhibitions.length - 1);
      scrollTween?.kill();
      scrollTween = gsap.to(area, {
        scrollTop: target,
        duration: Math.min(1.8, 0.55 + Math.abs(destination - area.scrollTop / maxScroll * (exhibitions.length - 1)) * 0.2),
        ease: "power2.inOut",
        onComplete: () => { scrollTween = null; },
      });
    };
    const cancelTween = () => { scrollTween?.kill(); scrollTween = null; };
    area.addEventListener("wheel", cancelTween, { passive: true });
    area.addEventListener("touchstart", cancelTween, { passive: true });
    return () => {
      cancelTween();
      area.removeEventListener("wheel", cancelTween);
      area.removeEventListener("touchstart", cancelTween);
      trigger.kill();
      goToIndex.current = () => undefined;
    };
  }, { scope: scroller, dependencies: [exhibitionKeys] });

  if (!exhibitions.length) return <div className="home-deck-empty">No upcoming exhibitions found. <Link href="/exhibitions">View all exhibitions</Link></div>;

  const now = new Date(asOf);
  return <section className="home-deck" aria-label="Upcoming exhibitions">
    <div className="home-deck-scroller" ref={scroller} tabIndex={0} aria-label="Scroll through upcoming exhibitions">
      <div className="home-deck-track" ref={track} style={{ height: exhibitions.length > 1 ? `${76 + 75 * (exhibitions.length - 1)}svh` : "100%" }}>
        <div className="home-deck-viewport">
          {exhibitions.map((item, index) => {
            const days = daysUntilStart(item.startDate, item.timezone, now);
            const live = getEventStatus(item.startDate, item.endDate, now, item.timezone).state === "ongoing";
            const tags = item.categories.length ? item.categories.map((category) => category.name) : item.industry.split(",").map((tag) => tag.trim()).filter(Boolean);
            const countdownSize = live || days >= 1000 ? " is-long" : days >= 100 ? " is-three-digit" : "";
            return <article key={item.id} className="exhibition-deck-card" ref={(node) => { cards.current[index] = node; }} aria-hidden={index >= visibleLayers}>
              <button type="button" className="deck-card-select" aria-label={`Bring ${item.name} to the front`} tabIndex={index >= visibleLayers ? -1 : 0} onClick={() => goToIndex.current(index)} />
              <div className="deck-card-full">
                <div className="deck-card-copy">
                  <span className="deck-card-label"><CalendarDays aria-hidden="true" /> <span className="deck-card-label-text">{index === 0 ? "Next Exhibition" : "Following Exhibition"}</span></span>
                  <h3 title={item.name}>{item.name}</h3>
                  <p><MapPin aria-hidden="true" /> {[item.city, item.country].filter(Boolean).join(", ")}</p>
                  <p><CalendarDays aria-hidden="true" /> {formatEventDate(item.startDate, item.endDate)}</p>
                  <div className="deck-card-tags">{tags.slice(0, 3).map((tag) => <span key={tag}>{tag}</span>)}</div>
                </div>
                <div className="deck-card-side">
                  <span className="deck-countdown-label"><i /> {live ? "Live now" : days === 0 ? "Starts today" : "Starts in"}</span>
                  <strong className={`deck-countdown-number${countdownSize}`}>{live ? "LIVE" : days}</strong>
                  {!live && days > 0 && <span className="deck-countdown-unit">{days === 1 ? "day" : "days"}</span>}
                  <Link className="deck-card-link" href={`/exhibitions/${item.slug}`} aria-label={`View ${item.name} details`}><ArrowRight aria-hidden="true" /></Link>
                </div>
              </div>
              <div className="deck-card-summary" aria-hidden="true">
                <div><strong>{item.name}</strong><span>{[item.city, item.country].filter(Boolean).join(", ")} · {formatEventDate(item.startDate, item.endDate)}</span></div>
                <span className="deck-summary-days">{live ? "LIVE" : days}<small>{live ? "now" : days === 1 ? "day" : "days"}</small></span>
              </div>
            </article>;
          })}
        </div>
      </div>
    </div>
  </section>;
}
