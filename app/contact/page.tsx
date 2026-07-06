import { Mail } from "lucide-react";
import { Card } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";

export default function ContactPage() {
  return (
    <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-3xl items-center container-px py-16">
      <Card className="w-full overflow-hidden">
        <div className="bg-grass px-6 py-10 text-cream sm:px-10">
          <p className="font-serif text-lg italic text-leaf-accent">Contact Seeded</p>
          <h1 className="mt-2 text-4xl font-light tracking-tight">Questions, feedback, or support.</h1>
        </div>
        <div className="p-6 sm:p-10">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-lg text-ink">
                Send an email to{" "}
                <a href="mailto:NiranRamprasad@gmail.com" className="font-medium text-grass underline-offset-4 hover:underline">
                  NiranRamprasad@gmail.com
                </a>{" "}
                for any questions.
              </p>
              <p className="mt-3 text-sm leading-relaxed text-stone">
                For recruiting data corrections, include the school name, program gender, and the field that needs review.
              </p>
            </div>
            <a
              href="mailto:NiranRamprasad@gmail.com"
              className={buttonVariants({ variant: "primary", size: "lg" })}
            >
              <Mail className="h-4 w-4" />
              Email us
            </a>
          </div>
        </div>
      </Card>
    </div>
  );
}
