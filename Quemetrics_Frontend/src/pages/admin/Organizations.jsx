import { useState } from 'react';
import { Link } from 'react-router-dom';
// import { useAdmin } from '../../hooks/useAdmin';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import Alert from '../../components/ui/Alert';
import Loader from '../../components/ui/Loader';

export default function AdminOrganizations() {
  // const {
  //   pendingOrganizations,
  //   allOrganizations,
  //   loading,
  //   getPendingOrganizations,
  //   getAllOrganizations,
  //   approveOrganization,
  //   rejectOrganization,
  // } = useAdmin();
  const [pendingOrganizations] = useState([]);
  const [allOrganizations] = useState([]);
  const [loading] = useState(false);
  const getPendingOrganizations = () => {};
  const getAllOrganizations = () => {};
  const approveOrganization = async () => ({ success: false, error: 'Admin hook unavailable' });
  const rejectOrganization = async () => ({ success: false, error: 'Admin hook unavailable' });

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [rejectingId, setRejectingId] = useState(null);

  // useEffect(() => {
  //   getPendingOrganizations();
  //   getAllOrganizations();
  // }, []);

  const handleApprove = async (id) => {
    setError('');
    setSuccess('');

    const result = await approveOrganization(id);
    if (result.success) {
      setSuccess(result.message);
      getAllOrganizations();
    } else {
      setError(result.error);
    }
  };

  const handleReject = async (id) => {
    if (!rejectReason.trim()) {
      setError('Please provide a reason for rejection');
      return;
    }

    setError('');
    setSuccess('');

    const result = await rejectOrganization(id, rejectReason);
    if (result.success) {
      setSuccess(result.message);
      setRejectingId(null);
      setRejectReason('');
    } else {
      setError(result.error);
    }
  };

  if (loading) return <Loader />;

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold">Manage Organizations</h1>
          <Link to="/admin/dashboard">
            <Button variant="secondary">Back to Dashboard</Button>
          </Link>
        </div>

        <Alert type="error" message={error} />
        <Alert type="success" message={success} />

        <Card title="Pending Approvals" className="mb-6">
          {pendingOrganizations.length === 0 ? (
            <p className="text-gray-500">No pending organizations</p>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2">Organization</th>
                  <th className="text-left py-2">Contact</th>
                  <th className="text-left py-2">Email</th>
                  <th className="text-left py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {pendingOrganizations.map((org) => (
                  <tr key={org.id} className="border-b">
                    <td className="py-2">{org.organizationName}</td>
                    <td className="py-2">{org.contactPersonName}</td>
                    <td className="py-2">{org.User?.email}</td>
                    <td className="py-2 space-x-2">
                      {rejectingId === org.id ? (
                        <div className="flex items-center space-x-2">
                          <input
                            type="text"
                            value={rejectReason}
                            onChange={(e) => setRejectReason(e.target.value)}
                            placeholder="Rejection reason"
                            className="px-2 py-1 border rounded text-sm"
                          />
                          <Button variant="danger" onClick={() => handleReject(org.id)}>
                            Confirm
                          </Button>
                          <Button variant="secondary" onClick={() => setRejectingId(null)}>
                            Cancel
                          </Button>
                        </div>
                      ) : (
                        <>
                          <Button variant="success" onClick={() => handleApprove(org.id)}>
                            Approve
                          </Button>
                          <Button variant="danger" onClick={() => setRejectingId(org.id)}>
                            Reject
                          </Button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <Card title="All Organizations">
          {allOrganizations.length === 0 ? (
            <p className="text-gray-500">No organizations found</p>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2">Organization</th>
                  <th className="text-left py-2">Contact</th>
                  <th className="text-left py-2">Email</th>
                  <th className="text-left py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {allOrganizations.map((org) => (
                  <tr key={org.id} className="border-b">
                    <td className="py-2">{org.organizationName}</td>
                    <td className="py-2">{org.contactPersonName}</td>
                    <td className="py-2">{org.User?.email}</td>
                    <td className="py-2">
                      <span className={org.isVerified ? 'text-green-600' : 'text-yellow-600'}>
                        {org.isVerified ? 'Verified' : 'Pending'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    </div>
  );
}
