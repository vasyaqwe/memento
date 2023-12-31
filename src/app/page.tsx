import { createClient } from "@/lib/supabase/server"
import { cookies } from "next/headers"
import { Header } from "@/components/layout/header"
import { redirect } from "next/navigation"
import { CreateNoteForm } from "@/components/forms/create-note-form"
import { NOTES_LIMIT } from "@/config"
import { NotesList } from "@/components/notes-list"
import { type Note } from "@/types/supabase"

export default async function Index() {
   const cookieStore = cookies()
   const supabase = createClient(cookieStore)

   const {
      data: { session },
   } = await supabase.auth.getSession()

   if (!session) redirect("/sign-in")

   const { data: notes } = await supabase
      .from("notes")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(NOTES_LIMIT)

   return (
      <>
         <Header />
         <main className="mx-auto max-w-5xl px-5 pb-32 pt-7">
            <CreateNoteForm />
            <NotesList initialNotes={notes as Note[]} />
         </main>
         <div
            aria-hidden={true}
            style={{
               backgroundImage:
                  "linear-gradient(180deg, hsl(var(--background) / 0), hsl(var(--background)))",
            }}
            className="pointer-events-none fixed bottom-0 left-1/2 z-[99] h-28 w-full -translate-x-1/2 lg:h-36"
         />
      </>
   )
}
