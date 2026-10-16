/** One huge one-line principle. `soon` marks something not shipped yet. */
export function StatementSection({ lead, rest, soon = false }: { lead: string; rest?: string; soon?: boolean }) {
  return (
    <li className="py-12 sm:py-16">
      <p className="t-statement">
        <span className="text-fg">{lead}</span>
        {rest ? <span className="text-fg-2">{rest}</span> : null}
      </p>
      {soon ? <p className="mt-4 text-[17px] text-fg-2">Soon</p> : null}
    </li>
  );
}
