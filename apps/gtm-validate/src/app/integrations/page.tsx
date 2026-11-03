"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "sonner";
import { Key, Brain, Mail, CheckCircle, ExternalLink } from "lucide-react";
import { loadSettings, saveSettings } from "@/app/settings/actions";

const LLM_PROVIDERS = [
  { value: "openai", label: "OpenAI", keyHint: "sk-...", keyUrl: "https://platform.openai.com/api-keys", keyUrlLabel: "OpenAI Dashboard" },
] as const;

export default function IntegrationsPage() {
  const [llmApiKey, setLlmApiKey] = useState("");
  const [llmProvider, setLlmProvider] = useState("openai");
  const [clearoutApiKey, setClearoutApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [llmConfigured, setLlmConfigured] = useState(false);
  const [clearoutConfigured, setClearoutConfigured] = useState(false);

  useEffect(() => {
    loadSettings().then((r) => {
      if (r.settings) {
        setLlmConfigured(r.settings.llm_configured);
        setLlmProvider("openai");
        setClearoutConfigured(r.settings.clearout_configured);
      }
      if (r.error) setLoadError(r.error);
      setLoaded(true);
    });
  }, []);

  async function handleSaveAll(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const formData = new FormData();
      formData.set("llm_provider", llmProvider);
      if (llmApiKey.trim()) formData.set("llm_api_key", llmApiKey.trim());
      if (clearoutApiKey.trim()) formData.set("clearout_api_key", clearoutApiKey.trim());

      const result = await saveSettings(formData);
      if (result?.error) throw new Error(result.error);
      toast.success("Settings saved");
      if (llmApiKey.trim()) setLlmConfigured(true);
      if (clearoutApiKey.trim()) setClearoutConfigured(true);
    } catch {
      toast.error("Failed to save settings");
    } finally {
      setSaving(false);
    }
  }

  const selectedProvider = LLM_PROVIDERS.find((p) => p.value === llmProvider) ?? LLM_PROVIDERS[0];

  if (!loaded) return <p className="text-sm text-muted-foreground py-8 text-center">Loading...</p>;
  if (loadError) return <p className="text-sm text-red-600 py-8 text-center">Failed to load settings: {loadError}</p>;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Integrations</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Connect external APIs to power the validation pipeline.
        </p>
      </div>

      <form onSubmit={handleSaveAll} className="space-y-6">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex size-9 items-center justify-center rounded-lg bg-blue-500/10">
                <Brain className="size-4 text-blue-500" />
              </div>
              <div>
                <CardTitle className="text-base">AI Provider (LLM)</CardTitle>
                <CardDescription>AI-powered ICP vertical matching</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {llmConfigured && (
              <div className="flex items-center gap-2 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                <CheckCircle className="size-4" />
                Connected
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="llm-provider">Provider</Label>
              <Select
                id="llm-provider"
                className="w-full"
                value={llmProvider}
                onChange={(e) => setLlmProvider(e.target.value)}
              >
                {LLM_PROVIDERS.map((p) => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="llm-api-key" className="flex items-center gap-1.5">
                <Key className="size-3.5" />
                API Key
              </Label>
              <Input id="llm-api-key" value={llmApiKey} onChange={(e) => setLlmApiKey(e.target.value)} placeholder={selectedProvider.keyHint} type="password" />
              <p className="text-xs text-muted-foreground">
                Get your key from{" "}
                <a href={selectedProvider.keyUrl} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
                  {selectedProvider.keyUrlLabel}
                  <ExternalLink className="inline size-3 ml-0.5" />
                </a>
                .
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex size-9 items-center justify-center rounded-lg bg-purple-500/10">
                <Mail className="size-4 text-purple-500" />
              </div>
              <div>
                <CardTitle className="text-base">Clearout</CardTitle>
                <CardDescription>Email deliverability verification and SMTP validation</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {clearoutConfigured && (
              <div className="flex items-center gap-2 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                <CheckCircle className="size-4" />
                Connected
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="clearout-api-key" className="flex items-center gap-1.5">
                <Key className="size-3.5" />
                API Key
              </Label>
              <Input id="clearout-api-key" value={clearoutApiKey} onChange={(e) => setClearoutApiKey(e.target.value)} placeholder="Clearout API key" type="password" />
              <p className="text-xs text-muted-foreground">
                Get your key from{" "}
                <a href="https://app.clearout.io/settings/api" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
                  Clearout Dashboard
                  <ExternalLink className="inline size-3 ml-0.5" />
                </a>
                .
              </p>
            </div>
          </CardContent>
        </Card>

        <div className="flex items-center justify-end">
          <Button type="submit" disabled={saving}>
            {saving ? "Saving..." : "Save Settings"}
          </Button>
        </div>
      </form>
    </div>
  );
}
