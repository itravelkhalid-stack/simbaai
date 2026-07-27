import { redirect } from "next/navigation";

/** Operations UI lives on /team (live agent runs + job registry). */
export default function Page() {
  redirect("/team");
}
