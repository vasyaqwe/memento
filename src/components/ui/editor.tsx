"use client"

import {
   useEditor,
   EditorContent,
   type Editor as CoreEditor,
   Extension,
} from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import Image from "@tiptap/extension-image"
import Link from "@tiptap/extension-link"
import Placeholder from "@tiptap/extension-placeholder"
import { Toggle, toggleVariants } from "@/components/ui/toggle"
import { nanoid } from "nanoid"
import { cn, getFileNameFromStorageUrl } from "@/lib/utils"
import { Hint } from "@/components/hint"
import {
   type ChangeEvent,
   type ClipboardEvent,
   useState,
   useEffect,
   useRef,
   type ComponentProps,
} from "react"
import { FileButton } from "@/components/ui/file-button"
import {
   Bold,
   Heading1,
   Heading2,
   ImageIcon,
   Italic,
   List,
   ListOrdered,
   Redo,
   Strikethrough,
   Undo,
} from "lucide-react"

import { Skeleton } from "@/components/ui/skeleton"
import { createClient } from "@/lib/supabase/client"
import { toast } from "sonner"

type EditorProps = {
   value: string
   onChange: (html: string) => void
   className?: string
   isPending: boolean
   onSubmit: () => void
} & Omit<ComponentProps<"form">, "onChange">

const ShiftEnterCreateExtension = Extension.create({
   addKeyboardShortcuts() {
      return {
         "Shift-Enter": ({ editor }) => {
            editor.commands.enter()
            return true
         },
      }
   },
})

export const Editor = ({
   value,
   onChange,
   className,
   isPending,
   onSubmit,
   ...props
}: EditorProps) => {
   const [isAnyTooltipVisible, setIsAnyTooltipVisible] = useState(false)
   const [isMounted, setIsMounted] = useState(false)
   const [imagesToDeleteFromBucket, setImagesToDeleteFromBucket] = useState<
      string[]
   >([])
   const formRef = useRef<HTMLFormElement>(null)

   const editor = useEditor({
      extensions: [
         StarterKit,
         Link,
         ShiftEnterCreateExtension,
         Image.configure({
            HTMLAttributes: {
               class: "rounded-md my-5",
            },
         }),
         Placeholder.configure({
            placeholder: "Anything on your mind...",
            showOnlyWhenEditable: false,
         }),
      ],
      content: value,
      editorProps: {
         attributes: {
            id: nanoid(),
            class: cn(
               "w-full py-3 px-4 min-h-[120px] focus:outline-none prose prose-invert",
               className
            ),
         },
      },
      onUpdate({ editor: _editor }) {
         const editor = _editor as CoreEditor

         onChange(editor.getHTML() === "<p></p>" ? "" : editor.getHTML())
         onImageNodesAddDelete({ editor })
      },
   })
   // eslint-disable-next-line @typescript-eslint/no-explicit-any
   const previousImages = useRef<HTMLImageElement[]>([])

   useEffect(() => {
      if (!editor) return

      if (isPending) {
         editor.setOptions({ editable: false })
      } else {
         editor.setOptions({ editable: true })
      }
   }, [isPending, editor])

   useEffect(() => {
      if (!isMounted && editor) {
         onImageNodesAddDelete({ editor })
         setIsMounted(true)
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
   }, [editor, isMounted])

   function onImageNodesAddDelete({ editor }: { editor: CoreEditor }) {
      const parser = new DOMParser()
      const doc = parser.parseFromString(editor.getHTML(), "text/html")

      // Get all img elements in the document
      const images = [...doc.querySelectorAll("img")]

      // Compare previous/current nodes to detect deleted ones
      const prevNodesById: Record<string, HTMLImageElement> = {}
      previousImages.current.forEach((node: HTMLImageElement) => {
         if (node.src) {
            prevNodesById[node.src] = node
         }
      })

      const nodesById: Record<string, HTMLImageElement> = {}
      images.forEach((node) => {
         if (node.src) {
            nodesById[node.src] = node
         }
      })

      previousImages.current = images

      for (const [id, node] of Object.entries(prevNodesById)) {
         const imageUrl = node.src
         if (!imageUrl) return

         const fileName = getFileNameFromStorageUrl(imageUrl)
         if (!fileName) return

         if (nodesById[id] === undefined) {
            setImagesToDeleteFromBucket?.((prev) =>
               prev.includes(fileName) ? prev : [...prev, fileName]
            )
         } else {
            setImagesToDeleteFromBucket?.((prev) =>
               prev.filter((prevFileName) => prevFileName !== fileName)
            )
         }
      }
   }

   if (!editor) return <Skeleton className="min-h-[176.5px] rounded-2xl" />

   const supabase = createClient()

   async function onImageChange(e: ChangeEvent<HTMLInputElement>) {
      if (e.target.files?.[0]) {
         uploadImage(e.target.files[0])
      }
   }

   async function onImagePaste(e: ClipboardEvent<HTMLDivElement>) {
      if (e.clipboardData.files?.[0]) {
         uploadImage(e.clipboardData.files[0])
      }
   }

   function uploadImage(file: File) {
      const upload = async () => {
         try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const editorId = (editor?.options.editorProps.attributes as any).id

            const { data, error } = await supabase.storage
               .from("files")
               .upload(`${editorId}-${file.name}`, file, { upsert: true })

            if (error) {
               throw new Error("Error")
            }
            return data
         } catch (error) {
            throw error
         }
      }
      editor?.setOptions({ editable: false })

      toast.promise(upload(), {
         loading: "Uploading your image...",
         success: (uploadedImage) => {
            const src = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/files/${uploadedImage.path}`

            if (uploadedImage.path) {
               editor?.chain().focus().setImage({ src }).run()
               editor?.setOptions({ editable: true })
               editor?.chain().focus("end").run()
               editor?.commands.createParagraphNear()
               return "Image is uploaded"
            }
         },
         error: () => {
            editor?.setOptions({ editable: true })
            editor?.chain().focus("end").run()

            return "Failed to upload image, something went wrong"
         },
      })
   }

   async function removeImages() {
      if (imagesToDeleteFromBucket.length < 1) return

      await supabase.storage.from("files").remove(imagesToDeleteFromBucket)
   }

   return (
      <form
         ref={formRef}
         className="rounded-2xl border border-border/60 bg-muted transition focus-within:border-border
          focus-within:outline-none hover:border-border"
         {...props}
         onKeyDown={async (e) => {
            const isEmpty =
               !editor.state.doc.textContent.trim().length &&
               !editor.getJSON().content?.some((i) => i.type === "image")

            if (isEmpty || isPending) return

            if (
               e.key === "Enter" &&
               !e.shiftKey &&
               !e.ctrlKey &&
               !isEmpty &&
               !editor.isActive("bulletList") &&
               !editor.isActive("orderedList") &&
               !isPending
            ) {
               formRef.current?.requestSubmit()
            }
         }}
         onSubmit={async (e) => {
            e.preventDefault()
            onSubmit()
            editor?.commands.clearContent()
            await removeImages()
            setImagesToDeleteFromBucket([])
            editor.setOptions({
               editorProps: {
                  attributes: {
                     ...editor.options.editorProps.attributes,
                     id: nanoid(),
                  },
               },
            })
            previousImages.current = []
         }}
      >
         <div className="scroll-x flex overflow-x-auto border-b-2 border-dotted border-input p-2">
            <Hint
               delayDuration={isAnyTooltipVisible ? 0 : 300}
               onMouseOver={() => setIsAnyTooltipVisible(true)}
               onMouseLeave={() => setIsAnyTooltipVisible(false)}
               className="pr-0.5"
               content={"Heading (level 1)"}
            >
               <Toggle
                  size={"sm"}
                  content={"Heading (level 1)"}
                  pressed={editor.isActive("heading", { level: 1 })}
                  onPressedChange={() =>
                     editor.chain().focus().toggleHeading({ level: 1 }).run()
                  }
               >
                  <Heading1 className="opacity-80" />
               </Toggle>
            </Hint>
            <Hint
               delayDuration={isAnyTooltipVisible ? 0 : 300}
               onMouseOver={() => setIsAnyTooltipVisible(true)}
               onMouseLeave={() => setIsAnyTooltipVisible(false)}
               content={"Heading (level 2)"}
               className="px-0.5"
            >
               <Toggle
                  size={"sm"}
                  pressed={editor.isActive("heading", { level: 2 })}
                  onPressedChange={() =>
                     editor.chain().focus().toggleHeading({ level: 2 }).run()
                  }
               >
                  <Heading2 className="opacity-80" />
               </Toggle>
            </Hint>
            <Hint
               onMouseOver={() => setIsAnyTooltipVisible(true)}
               onMouseLeave={() => setIsAnyTooltipVisible(false)}
               className="px-0.5"
               delayDuration={isAnyTooltipVisible ? 0 : 300}
               content={"Bold"}
            >
               <Toggle
                  onMouseOver={() => setIsAnyTooltipVisible(true)}
                  onMouseLeave={() => setIsAnyTooltipVisible(false)}
                  size={"sm"}
                  pressed={editor.isActive("bold")}
                  onPressedChange={() =>
                     editor.chain().focus().toggleBold().run()
                  }
               >
                  <Bold className="opacity-80" />
               </Toggle>
            </Hint>
            <Hint
               onMouseOver={() => setIsAnyTooltipVisible(true)}
               onMouseLeave={() => setIsAnyTooltipVisible(false)}
               className="px-0.5"
               delayDuration={isAnyTooltipVisible ? 0 : 300}
               content={"Italic"}
            >
               <Toggle
                  onMouseOver={() => setIsAnyTooltipVisible(true)}
                  onMouseLeave={() => setIsAnyTooltipVisible(false)}
                  size={"sm"}
                  pressed={editor.isActive("italic")}
                  onPressedChange={() =>
                     editor.chain().focus().toggleItalic().run()
                  }
               >
                  <Italic className="opacity-80" />
               </Toggle>
            </Hint>
            <Hint
               onMouseOver={() => setIsAnyTooltipVisible(true)}
               onMouseLeave={() => setIsAnyTooltipVisible(false)}
               className="px-0.5"
               delayDuration={isAnyTooltipVisible ? 0 : 300}
               content={"Strikethrough"}
            >
               <Toggle
                  onMouseOver={() => setIsAnyTooltipVisible(true)}
                  onMouseLeave={() => setIsAnyTooltipVisible(false)}
                  size={"sm"}
                  pressed={editor.isActive("strike")}
                  onPressedChange={() =>
                     editor.chain().focus().toggleStrike().run()
                  }
               >
                  <Strikethrough className="opacity-80" />
               </Toggle>
            </Hint>
            <Hint
               onMouseOver={() => setIsAnyTooltipVisible(true)}
               onMouseLeave={() => setIsAnyTooltipVisible(false)}
               className="px-0.5"
               delayDuration={isAnyTooltipVisible ? 0 : 300}
               content={"Ordered list"}
            >
               <Toggle
                  onMouseOver={() => setIsAnyTooltipVisible(true)}
                  onMouseLeave={() => setIsAnyTooltipVisible(false)}
                  size={"sm"}
                  pressed={editor.isActive("orderedList")}
                  onPressedChange={() =>
                     editor.chain().focus().toggleOrderedList().run()
                  }
               >
                  <ListOrdered className="opacity-80" />
               </Toggle>
            </Hint>
            <Hint
               onMouseOver={() => setIsAnyTooltipVisible(true)}
               onMouseLeave={() => setIsAnyTooltipVisible(false)}
               className="px-0.5"
               delayDuration={isAnyTooltipVisible ? 0 : 300}
               content={"Unordered list"}
            >
               <Toggle
                  onMouseOver={() => setIsAnyTooltipVisible(true)}
                  onMouseLeave={() => setIsAnyTooltipVisible(false)}
                  size={"sm"}
                  pressed={editor.isActive("bulletList")}
                  onPressedChange={() =>
                     editor.chain().focus().toggleBulletList().run()
                  }
               >
                  <List className="opacity-80" />
               </Toggle>
            </Hint>
            <Hint
               onMouseOver={() => setIsAnyTooltipVisible(true)}
               onMouseLeave={() => setIsAnyTooltipVisible(false)}
               className="px-0.5"
               delayDuration={isAnyTooltipVisible ? 0 : 300}
               content={"Image"}
            >
               <FileButton
                  onMouseOver={() => setIsAnyTooltipVisible(true)}
                  onMouseLeave={() => setIsAnyTooltipVisible(false)}
                  className={cn("text-foreground")}
                  // disabled={isUploading}
                  onChange={onImageChange}
                  accept="image/*"
               >
                  <ImageIcon className="opacity-80" />
               </FileButton>
            </Hint>
            <Hint
               onMouseOver={() => setIsAnyTooltipVisible(true)}
               onMouseLeave={() => setIsAnyTooltipVisible(false)}
               className="px-0.5"
               delayDuration={isAnyTooltipVisible ? 0 : 300}
               content={"Undo"}
            >
               <button
                  type="button"
                  onMouseOver={() => setIsAnyTooltipVisible(true)}
                  onMouseLeave={() => setIsAnyTooltipVisible(false)}
                  className={cn(
                     toggleVariants({ size: "sm" }),
                     "text-foreground"
                  )}
                  onClick={() => editor.chain().focus().undo().run()}
               >
                  <Undo className="opacity-80" />
               </button>
            </Hint>
            <Hint
               onMouseOver={() => setIsAnyTooltipVisible(true)}
               onMouseLeave={() => setIsAnyTooltipVisible(false)}
               className="px-0.5"
               delayDuration={isAnyTooltipVisible ? 0 : 300}
               content={"Redo"}
            >
               <button
                  type="button"
                  onMouseOver={() => setIsAnyTooltipVisible(true)}
                  onMouseLeave={() => setIsAnyTooltipVisible(false)}
                  className={cn(
                     toggleVariants({ size: "sm" }),
                     "text-foreground"
                  )}
                  onClick={() => editor.chain().focus().redo().run()}
               >
                  <Redo className="opacity-80" />
               </button>
            </Hint>
         </div>
         <EditorContent
            onPaste={onImagePaste}
            editor={editor}
         />
      </form>
   )
}
