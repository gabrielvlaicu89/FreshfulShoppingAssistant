import React from "react";
import { useQueryClient } from "@tanstack/react-query";

import type { AuthSessionRecord } from "./contracts";
import { GoogleSignInCancelledError } from "./service";
import type { AuthService } from "./service";

type AuthStatus = "bootstrapping" | "signed-out" | "signed-in";

interface AuthState {
  status: AuthStatus;
  isBusy: boolean;
  record: AuthSessionRecord | null;
  errorMessage: string | null;
}

export interface AuthContextValue {
  status: AuthStatus;
  isBusy: boolean;
  session: AuthSessionRecord["session"] | null;
  user: AuthSessionRecord["user"] | null;
  errorMessage: string | null;
  signIn(): Promise<void>;
  signOut(): Promise<void>;
}

export interface AuthProviderProps {
  authService: AuthService;
  children: React.ReactNode;
}

const AuthContext = React.createContext<AuthContextValue | null>(null);

function createSignedOutState(errorMessage: string | null = null): AuthState {
  return {
    status: "signed-out",
    isBusy: false,
    record: null,
    errorMessage
  };
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return "Unable to sign in right now. Please try again.";
}

export function AuthProvider({ authService, children }: AuthProviderProps): React.JSX.Element {
  const queryClient = useQueryClient();
  const [state, setState] = React.useState<AuthState>({
    status: "bootstrapping",
    isBusy: false,
    record: null,
    errorMessage: null
  });

  React.useEffect(() => {
    let active = true;

    void authService.restoreSession().then((record) => {
      if (!active) {
        return;
      }

      setState(
        record
          ? {
              status: "signed-in",
              isBusy: false,
              record,
              errorMessage: null
            }
          : createSignedOutState()
      );
    });

    return () => {
      active = false;
    };
  }, [authService]);

  const value: AuthContextValue = {
    status: state.status,
    isBusy: state.isBusy,
    session: state.record?.session ?? null,
    user: state.record?.user ?? null,
    errorMessage: state.errorMessage,
    async signIn() {
      setState((currentState) => ({
        ...currentState,
        isBusy: true,
        errorMessage: null
      }));

      try {
        const record = await authService.signInWithGoogle();

        setState({
          status: "signed-in",
          isBusy: false,
          record,
          errorMessage: null
        });
      } catch (error) {
        if (error instanceof GoogleSignInCancelledError) {
          setState(createSignedOutState());
          return;
        }

        setState(createSignedOutState(getErrorMessage(error)));
      }
    },
    async signOut() {
      setState((currentState) => ({
        ...currentState,
        isBusy: true,
        errorMessage: null
      }));

      try {
        await authService.signOut();
      } finally {
        queryClient.clear();
        setState(createSignedOutState());
      }
    }
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = React.useContext(AuthContext);

  if (!value) {
    throw new Error("Auth context is not available.");
  }

  return value;
}