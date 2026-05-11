import { NavLink, Outlet } from 'react-router-dom'
import { Tv, List, Film, Star, Settings, Play, Info } from 'lucide-react'

const navItems = [
  { to: '/guide', label: 'Guide', icon: Tv },
  { to: '/channels', label: 'Channels', icon: List },
  { to: '/filler', label: 'Filler', icon: Film },
  { to: '/custom-shows', label: 'Custom Shows', icon: Star },
  { to: '/settings', label: 'Settings', icon: Settings },
  { to: '/player', label: 'Player', icon: Play },
  { to: '/version', label: 'Version', icon: Info },
]

export default function Layout() {
  return (
    <div className="flex h-screen overflow-hidden bg-gray-900">
      {/* Sidebar */}
      <nav className="w-48 shrink-0 bg-gray-800 flex flex-col border-r border-gray-700">
        <div className="px-4 py-4 border-b border-gray-700">
          <div className="flex items-center gap-2">
            <Tv size={20} className="text-blue-400" />
            <span className="font-bold text-white text-lg">dizqueTV</span>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto py-2">
          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-400 hover:text-white hover:bg-gray-700'
                }`
              }
            >
              <Icon size={16} />
              {label}
            </NavLink>
          ))}
        </div>
      </nav>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  )
}
