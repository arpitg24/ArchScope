import { login, register, forgotPassword, resetPassword } from '@/backend/controllers/auth';

export async function POST(req: Request) {
    const body = await req.json();

    const { action, ...data } = body;

    if (!action) {
        return Response.json({ error: 'Action required' }, { status: 400 });
    }

    if (action === 'login') {
        return login(data);
    }

    if (action === 'register') {
        return register(data);
    }
    
    if (action === 'forgot-password') {
        return forgotPassword(data);
    }
    
    if (action === 'reset-password') {
        return resetPassword(data);
    }

    return Response.json({ error: 'Invalid action' }, { status: 400 });
}