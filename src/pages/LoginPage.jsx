import { useState } from "react";
import { SignIn, SignUp } from "@clerk/clerk-react";

const clerkAppearance = {
  variables: {
    colorPrimary:    "#00c419",
    colorBackground: "#fffff7",
    fontFamily:      "Inter, sans-serif",
  },
  elements: {
    card:              "shadow-xl border-2 border-washwell-gray-light rounded-3xl",
    formButtonPrimary: "bg-washwell-green hover:bg-washwell-green-dark",
  },
};

export default function LoginPage() {
  const [mode, setMode] = useState("signin");

  return (
    <div className="min-h-screen bg-washwell-cream font-body flex flex-col items-center justify-center gap-6 p-6">
      <img src="/logo.png" alt="Washwell Laundry Co." className="h-24 w-auto" />

      {/* Tab toggle */}
      <div className="flex gap-1 p-1 bg-white border-2 border-washwell-gray-light rounded-2xl shadow-sm">
        <button
          onClick={() => setMode("signin")}
          className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${
            mode === "signin"
              ? "bg-washwell-green text-white shadow-md"
              : "text-washwell-gray-dark hover:text-washwell-black"
          }`}
        >
          Sign In
        </button>
        <button
          onClick={() => setMode("signup")}
          className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${
            mode === "signup"
              ? "bg-washwell-green text-white shadow-md"
              : "text-washwell-gray-dark hover:text-washwell-black"
          }`}
        >
          Create Account
        </button>
      </div>

      {mode === "signin" ? (
        <SignIn
          routing="hash"
          afterSignInUrl="/"
          appearance={clerkAppearance}
        />
      ) : (
        <SignUp
          routing="hash"
          afterSignUpUrl="/"
          appearance={clerkAppearance}
        />
      )}
    </div>
  );
}
