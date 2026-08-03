import * as React from 'react';
import type { Analysis, CombinedResult } from '@/lib/diagnosis/types';
import type { DiagnosisEnvelope } from '@/lib/server/envelope'; // type-only import

// In-memory state for the diagnosis flow (photo → analysis → draping → result).
// Nothing here is persisted; the photo never leaves the device except for the
// one analysis API call. The envelope is the server-signed proof of the
// analysis, passed back untouched when saving.
type FlowState = {
  photoUri: string | null;
  analysis: Analysis | null;
  envelope: DiagnosisEnvelope | null;
  result: CombinedResult | null;
  setCapture: (photoUri: string, analysis: Analysis, envelope: DiagnosisEnvelope) => void;
  setResult: (result: CombinedResult) => void;
  reset: () => void;
};

const FlowContext = React.createContext<FlowState | null>(null);

export function FlowProvider({ children }: { children: React.ReactNode }) {
  const [photoUri, setPhotoUri] = React.useState<string | null>(null);
  const [analysis, setAnalysis] = React.useState<Analysis | null>(null);
  const [envelope, setEnvelope] = React.useState<DiagnosisEnvelope | null>(null);
  const [result, setResultState] = React.useState<CombinedResult | null>(null);

  const value = React.useMemo<FlowState>(
    () => ({
      photoUri,
      analysis,
      envelope,
      result,
      setCapture: (uri, a, env) => {
        setPhotoUri(uri);
        setAnalysis(a);
        setEnvelope(env);
        setResultState(null);
      },
      setResult: setResultState,
      reset: () => {
        setPhotoUri(null);
        setAnalysis(null);
        setEnvelope(null);
        setResultState(null);
      },
    }),
    [photoUri, analysis, envelope, result],
  );

  return <FlowContext.Provider value={value}>{children}</FlowContext.Provider>;
}

export function useFlow(): FlowState {
  const ctx = React.useContext(FlowContext);
  if (!ctx) throw new Error('useFlow must be used inside FlowProvider');
  return ctx;
}
