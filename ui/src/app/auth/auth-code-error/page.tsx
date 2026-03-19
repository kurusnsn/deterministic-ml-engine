import Link from 'next/link'

export default function AuthCodeError() {
  return (
    <div className="flex flex-col items-center justify-center h-screen">
      <h1 className="text-2xl font-bold">Authentication Error</h1>
      <p className="mt-4">
        There was an error during the authentication process.
      </p>
      <Link href="/login" className="mt-8 px-4 py-2 bg-blue-500 text-white rounded-md">
        Go back to login
      </Link>
    </div>
  )
}
