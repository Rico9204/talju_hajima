import { Fragment } from "react";
import { matchRanges } from "../lib/workspaceSearch";
export default function SearchHighlight({ text, query }: { text: string; query: string }) {
  const ranges = matchRanges(text, query);
  let end = 0;
  return <>{ranges.map((range) => {
    const prefix = text.slice(end, range.start); end = range.end;
    return <Fragment key={range.start}>{prefix}<mark className="rounded-sm bg-yellow-300 text-yellow-950">{text.slice(range.start, range.end)}</mark></Fragment>;
  })}{text.slice(end)}</>;
}
