import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate } from '@tanstack/react-router';
import { z } from 'zod';

import { Button, ErrorBanner, Field } from '../components/index.js';
import { api, ProblemError } from '../lib/api/client.js';
import { useAuth } from '../lib/auth/AuthProvider.js';

const SignInSchema = z.object({
  email: z.string().email({ message: 'Enter a valid email address' }),
  password: z.string().min(12, { message: 'Password must be at least 12 characters' }),
});

type SignInValues = z.infer<typeof SignInSchema>;

export function SignInRoute(): JSX.Element {
  const auth = useAuth();
  const navigate = useNavigate();
  const [submitError, setSubmitError] = useState<unknown>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignInValues>({ resolver: zodResolver(SignInSchema) });

  async function onSubmit(values: SignInValues): Promise<void> {
    setSubmitError(null);
    try {
      await api.post('/auth/sign-in', values);
      await auth.refresh();
      // AuthGate only redirects anonymous → /sign-in; it doesn't push
      // authenticated users off this page. Send them to the role-home
      // redirector explicitly.
      await navigate({ to: '/', replace: true });
    } catch (err) {
      if (err instanceof ProblemError && err.status === 401) {
        setSubmitError(new ProblemError({ ...err, detail: 'Email or password incorrect.' }));
      } else {
        setSubmitError(err);
      }
    }
  }

  return (
    <main className="psms-auth">
      <h1>Sign in to Knox PSMS</h1>
      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <ErrorBanner error={submitError} />
        <Field
          label="Email"
          type="email"
          autoComplete="email"
          autoFocus
          error={errors.email?.message}
          {...register('email')}
        />
        <Field
          label="Password"
          type="password"
          autoComplete="current-password"
          error={errors.password?.message}
          {...register('password')}
        />
        <Button type="submit" loading={isSubmitting}>
          Sign in
        </Button>
        <p className="psms-auth__hint">
          Forgot your password? Contact the placement coordinator to request a reset.
        </p>
      </form>
    </main>
  );
}
