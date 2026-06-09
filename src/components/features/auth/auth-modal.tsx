'use client';

import { useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/context/auth';

export default function AuthModal() {
    const { isOpen, closeAuth, login } = useAuth();
    const [mode, setMode] = useState<'login' | 'register' | 'forgot-password'>('login');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [username, setUsername] = useState('');

    async function handleSubmit() {
        const res = await fetch('/api/auth', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: mode,
                username,
                email,
                password
            }),
        });

        const data = await res.json();

        if (!res.ok) {
            alert(data.error);
            return;
        }

        if (mode === 'forgot-password') {
            alert(data.message);
            setMode('login');
            return;
        }

        if (data.token && data.user) {
            login(data.user, data.token);
        }

        closeAuth();
    }

    return (
        <Dialog open={isOpen} onOpenChange={closeAuth}>
            <DialogContent className="space-y-4">
                <h2 className="text-lg font-semibold">
                    {mode === 'login' ? 'Login' : mode === 'register' ? 'Register' : 'Reset Password'}
                </h2>

                <Input
                    placeholder="Email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                />

                {mode !== 'forgot-password' && (
                    <Input
                        type="password"
                        placeholder="Password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                    />
                )}

                {mode === 'register' && (
                    <Input
                        placeholder="Username"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                    />
                )}

                {mode === 'login' && (
                    <div className="flex justify-end">
                        <button
                            onClick={() => setMode('forgot-password')}
                            className="text-sm text-blue-600 hover:underline"
                        >
                            Forgot Password?
                        </button>
                    </div>
                )}

                <Button onClick={handleSubmit} className="w-full">
                    {mode === 'login' ? 'Login' : mode === 'register' ? 'Register' : 'Send Reset Link'}
                </Button>

                {mode !== 'forgot-password' ? (
                    <Button
                        variant="ghost"
                        onClick={() =>
                            setMode(mode === 'login' ? 'register' : 'login')
                        }
                        className="w-full"
                    >
                        Switch to {mode === 'login' ? 'Register' : 'Login'}
                    </Button>
                ) : (
                    <Button
                        variant="ghost"
                        onClick={() => setMode('login')}
                        className="w-full"
                    >
                        Back to Login
                    </Button>
                )}
            </DialogContent>
        </Dialog>
    );
}