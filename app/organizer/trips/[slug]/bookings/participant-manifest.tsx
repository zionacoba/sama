import { resolveAttendee } from "@/lib/attendee";

// Shared per-slot manifest for multi-slot bookings: the "{done}/{slots}
// confirmed" expander used by the list view (bookings-list.tsx) and both
// grouped-view layouts (page.tsx). Shows each participant's name, emergency
// contact, and medical notes. Slot 0 routes through resolveAttendee so a
// transferred booking's unsigned replacement never displays the original
// booker's data (transfers are single-slot only today, so that path is
// defensive). No hooks and no server-only imports: usable from both the server
// page and the client list.

type ManifestBooking = {
  status: string;
  slots: number;
  full_name: string;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  medical_notes: string | null;
  meeting_point: string | null;
};

type ManifestParticipant = {
  slot_number: number;
  full_name: string | null;
  completed: boolean;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  medical_notes: string | null;
  meeting_point: string | null;
};

export function ParticipantManifest({
  b,
  participants,
  className = "mt-1 text-left",
}: {
  b: ManifestBooking;
  participants: ManifestParticipant[];
  className?: string;
}) {
  const done = participants.filter((p) => p.completed).length;
  return (
    <details className={className}>
      <summary className="cursor-pointer list-none text-xs font-medium text-stone-500 hover:text-stone-600">
        {done}/{b.slots} confirmed
      </summary>
      <ul className="mt-1 space-y-1 pl-0.5">
        {participants.map((p) => {
          const isSlotZero = p.slot_number === 0;
          const attendee = isSlotZero ? resolveAttendee(b, p) : null;
          const name = attendee ? attendee.name : p.full_name ?? `Participant ${p.slot_number + 1}`;
          const ecName = attendee ? attendee.emergencyContactName : p.emergency_contact_name;
          const ecPhone = attendee ? attendee.emergencyContactPhone : p.emergency_contact_phone;
          // The bookings row is canonical for the booker's medical notes; a
          // transferred booking's medical is the replacement's and exists only
          // once they complete /join. Never fall back to the booker's.
          const medical = isSlotZero
            ? b.status === "transferred"
              ? p.completed
                ? p.medical_notes
                : null
              : b.medical_notes
            : p.medical_notes;
          // Awaiting rows hide the data lines rather than showing blank cells:
          // transferred slot 0 defers to the helper (its name already reads
          // "Awaiting replacement details"), slots 1+ are awaiting until their
          // /join is completed.
          const awaiting = attendee ? attendee.awaiting : !p.completed;
          return (
            <li key={p.slot_number} className="flex items-start gap-1 text-xs">
              <span className={p.completed ? "text-emerald-500" : "text-stone-300"}>●</span>
              <span className="min-w-0">
                <span className={p.completed ? "text-stone-700" : "text-stone-500"}>{name}</span>
                {awaiting ? (
                  !attendee?.awaiting && (
                    <span className="text-stone-400 italic"> · awaiting details</span>
                  )
                ) : (
                  <>
                    <span className="block text-stone-500">
                      Emergency:{" "}
                      {ecName ? (
                        <>
                          <span className="font-medium text-stone-600">{ecName}</span>
                          {ecPhone && ecPhone !== ecName && <span> · {ecPhone}</span>}
                        </>
                      ) : (
                        <span className="text-stone-300">—</span>
                      )}
                    </span>
                    {medical && <span className="block text-stone-600">🏥 {medical}</span>}
                  </>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </details>
  );
}
