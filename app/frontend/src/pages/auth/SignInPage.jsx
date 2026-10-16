import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import Button from '../../components/ui/Button'
import { useSession } from '../../context/SessionContext'
import AuthLayout, { DemoNotice } from './AuthLayout'
import { EMAIL_RE, Field } from './fields'

export default function SignInPage() {
  const [params] = useSearchParams()
  const role = params.get('role') === 'admin' ? 'admin' : 'user'
  const { signIn } = useSession()
  const navigate = useNavigate()
  const [form, setForm] = useState({ email: '', password: '' })
  const [errors, setErrors] = useState({})

  const submit = (e) => {
    e.preventDefault()
    const err = {}
    if (!EMAIL_RE.test(form.email.trim())) err.email = 'Enter an email address like name@example.com.'
    if (!form.password) err.password = 'Enter a password.'
    setErrors(err)
    if (Object.keys(err).length) return
    signIn(role, form.email.split('@')[0]) // demo: the password is not checked or kept
    navigate(role === 'admin' ? '/admin' : '/app/home', { replace: true })
  }

  return (
    <AuthLayout
      title={role === 'admin' ? 'Admin sign in' : 'Sign in'}
      subtitle={role === 'admin' ? 'Demo admin workspace: no real permissions are enforced.' : 'Welcome back. Ready to practise?'}
    >
      <form noValidate onSubmit={submit} className="space-y-4">
        <Field label="Email" type="email" autoComplete="email" value={form.email} error={errors.email}
               onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <Field label="Password" type="password" autoComplete="current-password" value={form.password} error={errors.password}
               onChange={(e) => setForm({ ...form, password: e.target.value })} />
        <p className="text-xs text-sl-ink-600">Forgotten password: not available, because there are no real accounts yet.</p>
        <Button type="submit" size="lg" className="w-full" variant={role === 'admin' ? 'purple' : 'primary'}>Sign in</Button>
      </form>
      <div className="flex flex-wrap justify-between gap-2 text-sm">
        <Link to="/welcome" className="font-semibold underline underline-offset-4">← Choose another role</Link>
        {role === 'user' && <Link to="/register" className="font-semibold underline underline-offset-4">Create a learner profile</Link>}
      </div>
      <DemoNotice />
    </AuthLayout>
  )
}
