"use client";

import { useEffect, useState } from "react";
import { CalendarButton } from "@/components/CalendarButton";
import type { HomeSetup } from "@/lib/homeSetup";
import { calendarFeedPath, readSteps, stepsDone, writeSteps, type Steps } from "@/lib/makeItYours";
import { SendToPhone } from "./SendToPhone";

// "Make it yours", under the hero of a page the visitor has just built: the page is already saved (step one), and the
// two steps that follow are the only ways the site has to take it with you. Each is marked done only when its action
// really ran. Shown to visitors who built through the picker (which writes the steps record), until they dismiss it.
export function MakeItYours({ setup, onEdit }: { setup: HomeSetup; onEdit: () => void }) {
  const [steps, setSteps] = useState<Steps | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSteps(readSteps());
  }, []);

  if (!steps || steps.dismissed) return null;

  const update = (patch: Partial<Steps>) =>
    setSteps((cur) => {
      const next = { ...(cur ?? steps), ...patch };
      writeSteps(next);
      return next;
    });
  const done = stepsDone(steps);
  const all = done === 3;
  const feed = calendarFeedPath(setup.blocks);
  const n = setup.blocks.length;

  return (
    <section className="card miy" aria-label="Make it yours" data-module="make-it-yours">
      <div className="miy-hd">
        <div>
          <b>{all ? "All set. It's yours." : `Make it yours: ${done} of 3 done`}</b>
          <span>{all ? "Next time you open this site on this device, it opens on this page." : "Two more steps take it to your phone and your calendar."}</span>
          <div className="miy-prog" role="progressbar" aria-valuemin={0} aria-valuemax={3} aria-valuenow={done} aria-label="Steps done">
            <i style={{ width: `${(done / 3) * 100}%` }} />
          </div>
        </div>
        <button type="button" className="miy-x" onClick={() => update({ dismissed: true })} aria-label="Hide this">
          ×
        </button>
      </div>
      <div className="miy-steps">
        <div className="miy-st is-done">
          <span className="miy-c" aria-hidden>✓</span>
          <div>
            <b>Page built: {n} {n === 1 ? "block" : "blocks"}</b>
            <span>Saved in this browser</span>
          </div>
        </div>
        <div className={`miy-st${steps.phone ? " is-done" : ""}`}>
          <span className="miy-c" aria-hidden>{steps.phone ? "✓" : ""}</span>
          <div>
            <b>Put it on your phone</b>
            <span>{steps.phone ? "Link sent or copied" : "A link that opens this page on another device"}</span>
            {!steps.phone && <SendToPhone setup={setup} onSent={() => update({ phone: true })} />}
          </div>
        </div>
        <div className={`miy-st${steps.cal ? " is-done" : ""}`}>
          <span className="miy-c" aria-hidden>{steps.cal ? "✓" : ""}</span>
          <div>
            <b>Fixtures in your calendar</b>
            {feed ? (
              <>
                <span>{steps.cal ? "Calendar feed added or copied" : "A feed of your teams' fixtures that updates itself"}</span>
                {!steps.cal && <CalendarButton path={feed} label="Add to calendar" onUse={() => update({ cal: true })} />}
              </>
            ) : (
              <>
                <span>Needs a team on your page. Add one and its fixtures can go in your calendar.</span>
                <button type="button" className="miy-link" onClick={onEdit}>
                  Add a team
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
