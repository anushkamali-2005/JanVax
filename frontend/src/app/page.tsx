"use client";

import { signInWithGoogle, logOut, getCurrentUser, onAuthStateChanged } from "@/lib/firebase";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Shield, Smartphone, Bell, Activity, Globe, CheckCircle } from "lucide-react";

export default function LandingPage() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged((user) => {
      setUser(user);
      setLoading(false);
      if (user) {
        // router.push("/dashboard");
      }
    });
    return () => unsubscribe();
  }, [router]);

  const handleLogin = async () => {
    try {
      await signInWithGoogle();
      router.push("/dashboard");
    } catch (err) {
      console.error("Login failed", err);
    }
  };

  if (loading) return (
    <div className="min-h-screen bg-[#0f172a] flex items-center justify-center">
      <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#0f172a] text-white selection:bg-blue-500/30">
      {/* Navigation */}
      <nav className="border-b border-white/10 px-6 py-4 flex items-center justify-between backdrop-blur-md sticky top-0 z-50">
        <div className="flex items-center gap-2">
          <div className="bg-blue-600 p-2 rounded-xl shadow-lg shadow-blue-600/20">
            <Shield className="w-6 h-6 text-white" />
          </div>
          <span className="text-2xl font-bold tracking-tight bg-gradient-to-r from-white to-blue-400 bg-clip-text text-transparent">
            JanVax
          </span>
        </div>
        <div className="flex items-center gap-4">
          {user ? (
            <button
              onClick={() => router.push("/dashboard")}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-500 transition-all rounded-full font-semibold shadow-lg shadow-blue-600/20"
            >
              Go to Dashboard
            </button>
          ) : (
            <button
              onClick={handleLogin}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-500 transition-all rounded-full font-semibold shadow-lg shadow-blue-600/20"
            >
              Sign In
            </button>
          )}
        </div>
      </nav>

      {/* Hero Section */}
      <main className="max-w-7xl mx-auto px-6 pt-20 pb-32">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          <div className="space-y-8">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-sm font-medium">
              <Activity className="w-4 h-4" />
              <span>India's AI Vaccination Platform</span>
            </div>

            <h1 className="text-6xl lg:text-7xl font-bold leading-tight tracking-tight">
              Self-Improving, <br />
              <span className="bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-transparent">
                Explainable & Verifiable
              </span> <br />
              AI Vaccination
            </h1>

            <p className="text-xl text-slate-400 max-w-xl leading-relaxed">
              The digital vault for immunization records built for every Indian—from premium smartphones to basic feature phones.
            </p>

            <div className="flex items-center gap-4 pt-4">
              <button
                onClick={handleLogin}
                className="px-8 py-4 bg-blue-600 hover:bg-blue-500 transition-all rounded-2xl font-bold text-lg shadow-xl shadow-blue-600/30 flex items-center gap-3"
              >
                Get Started Now
                <Shield className="w-5 h-5" />
              </button>
              <button className="px-8 py-4 bg-white/5 hover:bg-white/10 transition-all rounded-2xl font-bold text-lg border border-white/10">
                View Demo
              </button>
            </div>

            <div className="flex items-center gap-8 pt-8">
              <div className="flex -space-x-4">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="w-12 h-12 rounded-full border-4 border-[#0f172a] bg-slate-800 overflow-hidden shadow-xl" />
                ))}
              </div>
              <div>
                <div className="text-2xl font-bold">1.2M+</div>
                <div className="text-slate-500 text-sm uppercase tracking-wider font-semibold">Records Secured</div>
              </div>
            </div>
          </div>

          {/* Floating UI Elements Mockup */}
          <div className="relative">
            <div className="relative z-10 bg-gradient-to-br from-slate-800 to-slate-900 border border-white/10 rounded-3xl p-8 shadow-2xl overflow-hidden aspect-square flex flex-col justify-center items-center group transition-all duration-700 hover:scale-[1.02]">
              <div className="absolute inset-0 bg-blue-500/5 group-hover:bg-blue-500/10 transition-all duration-700" />
              <div className="w-32 h-32 bg-blue-600 rounded-full flex items-center justify-center animate-pulse shadow-2xl shadow-blue-600/50">
                <Shield className="w-16 h-16 text-white" />
              </div>
              <div className="mt-8 text-center">
                <div className="text-2xl font-bold mb-2">Blockchain Verified</div>
                <div className="text-slate-400">Tamper-proof health records on Polygon</div>
              </div>
            </div>
            {/* Decorative Elements */}
            <div className="absolute -top-12 -right-12 w-64 h-64 bg-blue-600/20 blur-[100px] -z-10" />
            <div className="absolute -bottom-12 -left-12 w-64 h-64 bg-indigo-600/20 blur-[100px] -z-10" />
          </div>
        </div>

        {/* Features Grid */}
        <div className="mt-40 grid md:grid-cols-3 gap-8">
          {[
            {
              title: "Digital Vault",
              desc: "Lost your paper card? Access your history anytime, anywhere on any device.",
              icon: Shield,
              color: "blue"
            },
            {
              title: "Smart Reminders",
              desc: "SMS, Push, and USSD notifications ensure you never miss a critical dose.",
              icon: Bell,
              color: "indigo"
            },
            {
              title: "AI Risk Prediction",
              desc: "State-of-the-art XGBoost engine predicts risks before they become outbreaks.",
              icon: Activity,
              color: "rose"
            },
            {
              title: "OCR Scanner",
              desc: "Convert old paper cards into digital records instantly using AI-powered OCR.",
              icon: Smartphone,
              color: "emerald"
            },
            {
              title: "Blockchain Proof",
              desc: "Every AI decision and vaccination record is cryptographically signed and stored.",
              icon: CheckCircle,
              color: "amber"
            },
            {
              title: "Multi-Agent AI",
              desc: "Independent agents debate vaccination cases to ensure highest accuracy.",
              icon: Globe,
              color: "cyan"
            }
          ].map((f, i) => (
            <div key={i} className="p-8 rounded-3xl bg-white/5 border border-white/10 hover:border-white/20 transition-all group">
              <div className={`w-12 h-12 rounded-2xl bg-${f.color}-500/10 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform`}>
                <f.icon className={`w-6 h-6 text-${f.color}-400`} />
              </div>
              <h3 className="text-xl font-bold mb-3">{f.title}</h3>
              <p className="text-slate-400 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-white/10 py-12 px-6 bg-black/20">
        <div className="max-w-7xl mx-auto flex flex-col md:row items-center justify-between gap-8">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-blue-500" />
            <span className="font-bold tracking-tight">JanVax AI</span>
          </div>
          <p className="text-slate-500 text-sm">
            © 2024 JanVax India. Built for public health infrastructure.
          </p>
          <div className="flex gap-6">
            <a href="#" className="text-slate-400 hover:text-white transition-colors">Privacy</a>
            <a href="#" className="text-slate-400 hover:text-white transition-colors">Terms</a>
            <a href="#" className="text-slate-400 hover:text-white transition-colors">Support</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
