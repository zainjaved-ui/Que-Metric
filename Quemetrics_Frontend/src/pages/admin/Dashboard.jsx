import { useState } from 'react';
import { Link } from 'react-router-dom';
// import { useAuth } from '../../hooks/useAuth';
// import { useAdmin } from '../../hooks/useAdmin';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import Loader from '../../components/ui/Loader';

export default function AdminDashboard() {
  // const { user, logout } = useAuth();
  const user = null;
  const logout = () => {};
  // const { pendingOrganizations, allPlayers, loading, getPendingOrganizations, getAllPlayers } = useAdmin();
  const [pendingOrganizations] = useState([]);
  const [allPlayers] = useState([]);
  const [loading] = useState(false);
  const getPendingOrganizations = () => {};
  const getAllPlayers = () => {};

  // useEffect(() => {
  //   getPendingOrganizations();
  //   getAllPlayers();
  // }, []);

  if (loading) return <Loader />;

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold">Admin Dashboard</h1>
          <Button onClick={logout} variant="danger">
            Logout
          </Button>
        </div>

        <Card className="mb-6">
          <p className="text-gray-600">Welcome, Super Admin</p>
          <p className="text-sm text-gray-500 mt-1">{user?.email}</p>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
          <Card>
            <h3 className="text-lg font-semibold mb-2 text-gray-700">Pending Approvals</h3>
            <p className="text-4xl font-bold text-yellow-600">{pendingOrganizations?.length || 0}</p>
          </Card>

          <Card>
            <h3 className="text-lg font-semibold mb-2 text-gray-700">Total Players</h3>
            <p className="text-4xl font-bold text-blue-600">{allPlayers?.length || 0}</p>
          </Card>

          <Card>
            <h3 className="text-lg font-semibold mb-2 text-gray-700">System Status</h3>
            <p className="text-xl font-bold text-green-600">Healthy</p>
          </Card>
        </div>

        <Card title="Quick Actions" className="mb-6">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <Link to="/admin/organizations">
              <Button variant="secondary" className="w-full">Manage Organizations</Button>
            </Link>
            <Link to="/admin/players">
              <Button variant="secondary" className="w-full">View Players</Button>
            </Link>
            <Link to="/admin/settings">
              <Button variant="secondary" className="w-full">Account Settings</Button>
            </Link>
          </div>
        </Card>

        {pendingOrganizations?.length > 0 && (
          <Card title="Pending Organization Approvals">
            <ul className="space-y-2">
              {pendingOrganizations.slice(0, 5).map((org) => (
                <li key={org.id} className="flex justify-between items-center py-2 border-b">
                  <div>
                    <p className="font-medium">{org.organizationName}</p>
                    <p className="text-sm text-gray-500">{org.User?.email}</p>
                  </div>
                  <Link to="/admin/organizations">
                    <Button>Review</Button>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </div>
  );
}
