import { SignIn } from "@clerk/clerk-react";

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-washwell-cream font-body flex flex-col items-center justify-center gap-8 p-6">
      <img src="/logo.png" alt="Washwell Laundry Co." className="h-28 w-auto" />
      <SignIn
        routing="hash"
        afterSignInUrl="/"
        appearance={{
          variables: {
            colorPrimary:    "#00c419",
            colorBackground: "#fffff7",
            fontFamily:      "Inter, sans-serif",
          },
          elements: {
            card:           "shadow-xl border-2 border-washwell-gray-light rounded-3xl",
            formButtonPrimary: "bg-washwell-green hover:bg-washwell-green-dark",
          },
        }}
      />
    </div>
  );
}
