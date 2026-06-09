import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import apiClient from '../../../contexts/apiClient';
import Button from '../../ui/Button';
import Input from '../../ui/Input';
import Card from '../../ui/Card';
import Alert from '../../ui/Alert';

export default function AcceptInvitation() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token');

  // Dummy invitations data for UI demonstration
  const dummyInvitations = [
    {
      id: 1,
      clubName: 'The Jazz Club',
      invitedBy: 'alex@jazzclub.com',
      token: 'dummy-token-1',
      expiresAt: '2025-06-01',
    },
    {
      id: 2,
      clubName: 'Downtown Arena',
      invitedBy: 'sarah@downtownarena.com',
      token: 'dummy-token-2',
      expiresAt: '2025-06-15',
    },
    {
      id: 3,
      clubName: 'The Rooftop Lounge',
      invitedBy: 'mike@rooftoplounge.com',
      token: 'dummy-token-3',
      expiresAt: '2025-05-30',
    },
  ];

  const [invitations, setInvitations] = useState([]);
  const [approvalRequests, setApprovalRequests] = useState([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(true);

  // Inline acceptance state
  const [acceptingId, setAcceptingId] = useState(null);
  const [acceptingPassword, setAcceptingPassword] = useState('');
  const [acceptingConfirmPassword, setAcceptingConfirmPassword] = useState('');
  const [acceptingLoading, setAcceptingLoading] = useState(false);

  // Rejection state
  const [rejectingId, setRejectingId] = useState(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [rejectingLoading, setRejectingLoading] = useState(false);

  // Load venue approval requests
  useEffect(() => {
    const fetchApprovalRequests = async () => {
      try {
        const response = await apiClient.get('/venue-owner/approval-requests');
        if (response.data.success) {
          setApprovalRequests(response.data.data || []);
        }
      } catch (err) {
        console.error('Failed to fetch approval requests:', err);
        // If user is not authenticated as venue_owner, this will fail
        // which is fine - we'll just show invitations
      } finally {
        setLoading(false);
      }
    };

    if (!token) {
      setInvitations(dummyInvitations);
      fetchApprovalRequests();
    } else {
      setInvitations([]); // Clear invitations when showing password form
      setLoading(false);
    }
  }, [token]);

  // Reset messages when token changes
  useEffect(() => {
    setError('');
    setSuccess('');
  }, [token]);

  // Handle inline acceptance for a specific invitation
  const handleInlineAccept = async (invitation) => {
    // Basic validation
    if (acceptingPassword !== acceptingConfirmPassword) {
      toast.error('Passwords do not match');
      return;
    }
    if (acceptingPassword.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }

    setAcceptingLoading(true);
    setError('');
    setSuccess('');

    try {
      await apiClient.post('/venue-owner/accept-invitation', { invitationToken: invitation.token, password: acceptingPassword });

      // Remove the accepted invitation from the list and notify user
      setInvitations((prev) => prev.filter((inv) => inv.id !== invitation.id));
      toast.success(`Invitation from ${invitation.clubName} accepted! Please login to continue.`);

      // Reset inline form
      setAcceptingId(null);
      setAcceptingPassword('');
      setAcceptingConfirmPassword('');
    } catch (err) {
      const errorMsg = err.response?.data?.error || 'Failed to accept invitation';
      toast.error(errorMsg);
    } finally {
      setAcceptingLoading(false);
    }
  };

  // Cancel inline acceptance
  const handleCancelAccept = () => {
    setAcceptingId(null);
    setAcceptingPassword('');
    setAcceptingConfirmPassword('');
  };

  // Handle approval request approval
  const handleApprove = async (requestId) => {
    try {
      await apiClient.put(`/venue-owner/approval-requests/${requestId}/approve`);
      toast.success('Venue access approved successfully');

      // Remove from list
      setApprovalRequests((prev) => prev.filter((req) => req.id !== requestId));
    } catch (err) {
      const errorMsg = err.response?.data?.error || 'Failed to approve request';
      toast.error(errorMsg);
    }
  };

  // Handle approval request rejection
  const handleReject = async (requestId) => {
    if (!rejectionReason.trim()) {
      toast.error('Please provide a reason for rejection');
      return;
    }

    setRejectingLoading(true);
    try {
      await apiClient.put(`/venue-owner/approval-requests/${requestId}/reject`, { rejectionReason });
      toast.success('Venue access request rejected');

      // Remove from list
      setApprovalRequests((prev) => prev.filter((req) => req.id !== requestId));
      setRejectingId(null);
      setRejectionReason('');
    } catch (err) {
      const errorMsg = err.response?.data?.error || 'Failed to reject request';
      toast.error(errorMsg);
    } finally {
      setRejectingLoading(false);
    }
  };

  // If a token is provided (direct link), show the password setup form
  if (token) {
    // ... (keep the original token‑based flow unchanged)
    // (We'll include the same code as before for completeness)
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [tokenLoading, setTokenLoading] = useState(false);

    const handleSubmit = async (e) => {
      e.preventDefault();
      setError('');
      setSuccess('');

      if (password !== confirmPassword) {
        setError('Passwords do not match');
        toast.error('Passwords do not match');
        return;
      }

      if (password.length < 6) {
        setError('Password must be at least 6 characters');
        toast.error('Password must be at least 6 characters');
        return;
      }

      setTokenLoading(true);

      try {
          const response = await apiClient.post('/venue-owner/accept-invitation', { invitationToken: token, password });
          const data = response.data;

          if (data.success) {
            const isExistingUser = data.message && data.message.includes('existing');
            if (isExistingUser) {
              setSuccess('Venue owner role added to your account! Log in with your existing password. Redirecting to login...');
              toast.success('Venue owner role added! Log in with your existing password.');
            } else {
              setSuccess('Account created successfully! Please login to continue. Redirecting to login...');
              toast.success('Account created successfully! Redirecting to login...');
            }

            setTimeout(() => {
              navigate('/login');
            }, 2500);
          } else {
            setError(data.error || 'Failed to accept invitation');
            toast.error(data.error || 'Failed to accept invitation');
          }
      } catch (err) {
        const errorMsg = err.response?.data?.error || err.response?.data?.message || 'Failed to accept invitation';
        setError(errorMsg);
        toast.error(errorMsg);
      } finally {
        setTokenLoading(false);
      }
    };

    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FAFAFA] py-12 px-4 relative overflow-hidden">
        {/* Background Accents */}
        <div className="absolute top-0 right-0 w-[40rem] h-[40rem] bg-[#BA995D]/5 rounded-bl-full -mr-32 -mt-32 pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-[30rem] h-[30rem] bg-[#132F45]/5 rounded-tr-full -ml-24 -mb-24 pointer-events-none" />

        <div className="max-w-md w-full relative z-10">
          <div className="bg-[#132F45] px-8 py-6 md:py-8 rounded-t-[2.5rem] border-x border-t border-white/10 relative overflow-hidden flex items-center justify-center">
            <div className="absolute top-0 right-0 w-32 h-32 bg-[#BA995D]/10 rounded-bl-full -mr-12 -mt-12 pointer-events-none" />
            <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/5 rounded-tr-[3rem] -ml-8 -mb-8 pointer-events-none" />
            
            <div className="relative z-10 w-full">
              <p className="text-[8px] font-black uppercase tracking-[0.2em] text-[#BA995D] mb-3 flex items-center gap-3">
                <span className="w-6 h-[1px] bg-[#BA995D]" /> Setup Account
              </p>
              <h1 className="text-2xl font-black text-white uppercase tracking-tighter leading-none">Setup Account</h1>
            </div>
          </div>

          <div className="bg-white p-8 md:p-10 rounded-b-[2.5rem] border-x border-b border-gray-50 shadow-2xl shadow-[#132F45]/10">
            {error && <div className="mb-6 p-3 bg-red-50 border border-red-100 text-red-700 text-[9px] font-black uppercase tracking-widest rounded-xl">{error}</div>}
            {success && <div className="mb-6 p-3 bg-green-50 border border-green-100 text-[#166534] text-[9px] font-black uppercase tracking-widest rounded-xl">{success}</div>}

            {!success && (
              <form onSubmit={handleSubmit} className="space-y-8">
                <p className="text-gray-400 font-bold text-[9px] uppercase tracking-[0.2em] mb-4 leading-relaxed">
                  Finalize your administrative credentials to activate venue control.
                </p>

                <div className="group">
                  <label className="block text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1.5 pl-1 group-focus-within:text-[#BA995D] transition-colors">Access Password</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Min 6 characters"
                    className="w-full px-4 py-2.5 bg-[#FAFAFA] border border-gray-100 rounded-xl focus:ring-2 focus:ring-[#BA995D]/20 focus:border-[#BA995D] outline-none transition-all font-bold text-xs"
                    required
                  />
                </div>

                <div className="group">
                  <label className="block text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1.5 pl-1 group-focus-within:text-[#BA995D] transition-colors">Confirm Credentials</label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Repeat password"
                    className="w-full px-4 py-2.5 bg-[#FAFAFA] border border-gray-100 rounded-xl focus:ring-2 focus:ring-[#BA995D]/20 focus:border-[#BA995D] outline-none transition-all font-bold text-xs"
                    required
                  />
                </div>

                <button 
                  type="submit" 
                  disabled={tokenLoading} 
                  className="w-full py-4 bg-[#BA995D] text-white rounded-xl font-black text-[10px] uppercase tracking-[0.2em] hover:bg-[#A3864D] transition-all shadow-xl shadow-[#BA995D]/20 active:scale-95 disabled:opacity-50"
                >
                  {tokenLoading ? 'Configuring Account...' : 'Complete Activation'}
                </button>
              </form>
            )}

            <div className="mt-8 text-center">
              <Link to="/login" className="text-[9px] font-black text-[#132F45] uppercase tracking-widest hover:text-[#BA995D] transition-colors border-b border-[#132F45] pb-0.5">
                Return to Entry Portal
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }
  // Otherwise, show the list of pending invitations and approval requests
    return (
      <div className="min-h-screen bg-[#FAFAFA]">
        {/* ── Hero Header ──────────────────────────────────────────────── */}
        <div className="bg-[#132F45] px-4 sm:px-6 py-6 md:py-8 relative overflow-hidden flex items-center justify-center">
          <div className="absolute top-0 right-0 w-[40rem] h-[40rem] bg-[#BA995D]/5 rounded-bl-full -mr-32 -mt-32 pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-64 h-64 bg-white/5 rounded-tr-[5rem] -ml-16 -mb-16 pointer-events-none" />
          
          <div className="max-w-4xl w-full mx-auto relative z-10 flex flex-col xl:flex-row xl:items-center justify-between gap-10">
            <div>
              <p className="text-[8px] font-black uppercase tracking-[0.2em] text-[#BA995D] mb-3 flex items-center justify-center xl:justify-start gap-3 text-center xl:text-left">
                <span className="w-6 h-[1px] bg-[#BA995D]" /> Invitations
              </p>
              <h1 className="text-2xl md:text-3xl font-black text-white uppercase tracking-tighter leading-none mb-3 text-center xl:text-left">Invitations</h1>
              <p className="text-white/30 font-black text-[8px] uppercase tracking-[0.2em] max-w-md leading-relaxed text-center xl:text-left mx-auto xl:mx-0">
                 Manage incoming requests and invitations.
              </p>
            </div>

            {/* Stat Strip - Premium Design */}
            <div className="grid grid-cols-2 gap-1 bg-white/5 p-1 rounded-xl border border-white/10 backdrop-blur-xl shadow-2xl min-w-[240px]">
               <div className="flex flex-col items-center text-center px-6 border-r border-white/5 last:border-0 grow basis-0 py-2">
                <span className="text-lg font-black tracking-tighter text-white">{invitations.length + approvalRequests.length}</span>
                <span className="text-[6.5px] font-black uppercase tracking-[0.1em] text-white/30 mt-0.5 whitespace-nowrap">Total Alerts</span>
              </div>
              <div className="flex flex-col items-center text-center px-6 border-r border-white/5 last:border-0 grow basis-0 py-2">
                <div className="flex flex-col items-center translate-y-0.5">
                  <span className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_8px_#22c55e] animate-pulse mb-1"></span>
                  <span className="text-[6.5px] font-black uppercase tracking-[0.1em] text-[#BA995D] whitespace-nowrap">Secure Link</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10 md:py-16 flex flex-col gap-12 relative z-20 -mt-8">
        {/* Venue Approval Requests Section */}
        <section>
          <div className="flex items-center justify-between mb-8">
              <h2 className="text-[8px] font-black text-[#132F45] uppercase tracking-[0.25em] flex items-center gap-2">
                <div className="w-0.5 h-2.5 bg-[#BA995D] rounded-full" /> Venue Access
              </h2>
              <span className="bg-[#FDF2D1] text-[#BA995D] px-2 py-0.5 rounded text-[7px] font-black uppercase tracking-widest shadow-sm ring-1 ring-[#BA995D]/10">
                  {approvalRequests.length} Total
              </span>
          </div>

          {loading ? (
            <div className="p-12 text-center bg-white rounded-[1.5rem] border border-gray-100 shadow-xl shadow-[#132F45]/5">
               <p className="text-[9px] font-black uppercase tracking-widest text-[#BA995D] animate-pulse">Synchronizing Data...</p>
            </div>
          ) : approvalRequests.length === 0 ? (
            <div className="p-10 text-center bg-white rounded-[1.5rem] border border-gray-100 shadow-xl shadow-[#132F45]/5">
               <p className="text-gray-400 text-[9px] font-black uppercase tracking-widest">No pending venue access requests.</p>
            </div>
          ) : (
            <div className="grid gap-4">
              {approvalRequests.map((req) => (
                <div
                  key={req.id}
                  className="bg-white rounded-[1.5rem] border border-gray-100 p-5 shadow-xl shadow-[#132F45]/5 group relative overflow-hidden transition-all hover:shadow-2xl"
                >
                  {rejectingId === req.id ? (
                    // Rejection form
                    <div>
                      <h3 className="text-xs font-black text-[#132F45] mb-4 uppercase tracking-tight">
                        Reject Request: {req.requestingOrganization?.organizationName}
                      </h3>
                      <div className="mb-4">
                        <label className="block text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1.5 pl-1">Reason for Rejection</label>
                        <input
                          type="text"
                          value={rejectionReason}
                          onChange={(e) => setRejectionReason(e.target.value)}
                          placeholder="Briefly explain decision..."
                          className="w-full px-4 py-2 bg-[#FAFAFA] border border-gray-100 rounded-xl focus:ring-2 focus:ring-red-500/20 focus:border-red-500 outline-none transition-all font-bold text-xs"
                          required
                        />
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleReject(req.id)}
                          disabled={rejectingLoading}
                          className="px-4 py-2 bg-red-600 text-white text-[8px] font-black uppercase tracking-widest rounded-lg hover:bg-red-700 transition-all shadow-md active:scale-95 disabled:opacity-50"
                        >
                          {rejectingLoading ? 'Processing...' : 'Confirm Reject'}
                        </button>
                        <button
                          className="px-4 py-2 bg-gray-50 text-gray-500 text-[8px] font-black uppercase tracking-widest rounded-lg hover:bg-gray-100 transition-all active:scale-95"
                          onClick={() => {
                            setRejectingId(null);
                            setRejectionReason('');
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    // Normal request display
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
                      <div className="flex items-start gap-4">
                        <div className="w-10 h-10 bg-[#FAFAFA] border border-gray-50 rounded-xl flex items-center justify-center text-[#BA995D] font-black text-sm shadow-inner group-hover:bg-[#FDF2D1] transition-colors shrink-0">
                           {(req.requestingOrganization?.organizationName || 'U')[0]}
                        </div>
                        <div>
                          <h3 className="text-xs font-black text-[#132F45] uppercase tracking-tight leading-none mb-1.5">
                            {req.requestingOrganization?.organizationName || 'Unknown Organization'}
                          </h3>
                          <div className="flex flex-wrap items-center gap-3">
                            <span className="text-[9px] font-black text-[#BA995D] uppercase tracking-widest bg-[#FDF2D1]/50 px-2 py-0.5 rounded leading-none">
                              {req.venue?.venueName}
                            </span>
                            <span className="text-[8px] text-gray-400 font-bold tabular-nums">
                              {new Date(req.requestedAt).toLocaleDateString()}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <span className={`px-2 py-1 rounded text-[7.5px] font-black uppercase tracking-widest shadow-sm ring-1 ring-inset ${
                          req.requestStatus === 'pending' ? 'bg-[#FFF9E1] text-[#713F12] ring-[#FEF08A]' :
                          req.requestStatus === 'approved' ? 'bg-[#EBF5EE] text-[#2D6A4F] ring-[#B7E4C7]' :
                          'bg-red-50 text-red-600 ring-red-100'
                        }`}>
                          {req.requestStatus}
                        </span>

                        {req.requestStatus === 'pending' && (
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleApprove(req.id)}
                              className="px-3 py-1.5 bg-[#BA995D] text-white text-[8px] font-black uppercase tracking-widest rounded-lg hover:bg-[#A3864D] transition-all shadow-md active:scale-95"
                            >
                              Approve
                            </button>
                            <button
                              className="px-3 py-1.5 bg-white border border-gray-100 text-red-500 text-[8px] font-black uppercase tracking-widest rounded-lg hover:bg-red-50 transition-all active:scale-95"
                              onClick={() => {
                                setRejectingId(req.id);
                                setRejectionReason('');
                              }}
                            >
                              Reject
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Pending Invitations Section */}
        <section>
          <div className="flex items-center justify-between mb-8">
              <h2 className="text-[8px] font-black text-[#132F45] uppercase tracking-[0.25em] flex items-center gap-2">
                <div className="w-0.5 h-2.5 bg-[#BA995D] rounded-full" /> Pending Invitations
              </h2>
              <span className="bg-[#FDF2D1] text-[#BA995D] px-2 py-0.5 rounded text-[7px] font-black uppercase tracking-widest shadow-sm ring-1 ring-[#BA995D]/10">
                  {invitations.length} Total
              </span>
          </div>

          {invitations.length === 0 ? (
            <div className="p-10 text-center bg-white rounded-[1.5rem] border border-gray-100 shadow-xl shadow-[#132F45]/5">
               <p className="text-gray-400 text-[9px] font-black uppercase tracking-widest">No pending invitations.</p>
            </div>
          ) : (
            <div className="grid gap-4">
              {invitations.map((inv) => (
                <div
                  key={inv.id}
                  className="bg-white rounded-[1.5rem] border border-gray-100 p-5 shadow-xl shadow-[#132F45]/5 group relative overflow-hidden transition-all hover:shadow-2xl"
                >
                  {acceptingId === inv.id ? (
                    // Inline acceptance form for this invitation
                    <div className="relative z-10">
                      <h3 className="text-xs font-black text-[#132F45] mb-2 uppercase tracking-tight">Setup Password for {inv.clubName}</h3>
                      <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-4">Set credentials to finalize activation.</p>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                        <div className="group">
                          <label className="block text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1 pl-1">New Password</label>
                          <input
                            type="password"
                            value={acceptingPassword}
                            onChange={(e) => setAcceptingPassword(e.target.value)}
                            placeholder="Min 6 characters"
                            className="w-full px-4 py-2 bg-[#FAFAFA] border border-gray-100 rounded-xl focus:ring-2 focus:ring-[#BA995D]/20 focus:border-[#BA995D] outline-none transition-all font-bold text-xs"
                            required
                          />
                        </div>
                        <div className="group">
                          <label className="block text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1 pl-1">Confirm Identity</label>
                          <input
                            type="password"
                            value={acceptingConfirmPassword}
                            onChange={(e) => setAcceptingConfirmPassword(e.target.value)}
                            placeholder="Repeat password"
                            className="w-full px-4 py-2 bg-[#FAFAFA] border border-gray-100 rounded-xl focus:ring-2 focus:ring-[#BA995D]/20 focus:border-[#BA995D] outline-none transition-all font-bold text-xs"
                            required
                          />
                        </div>
                      </div>
                      
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleInlineAccept(inv)}
                          disabled={acceptingLoading}
                          className="px-4 py-2 bg-[#BA995D] text-white text-[8px] font-black uppercase tracking-widest rounded-lg hover:bg-[#A3864D] transition-all shadow-md active:scale-95"
                        >
                          {acceptingLoading ? 'Syncing...' : 'Activate Access'}
                        </button>
                        <button 
                          className="px-4 py-2 bg-gray-50 text-gray-500 text-[8px] font-black uppercase tracking-widest rounded-lg hover:bg-gray-100 transition-all active:scale-95"
                          onClick={handleCancelAccept}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    // Normal invitation display
                    <div className="flex items-center justify-between gap-6 relative z-10">
                      <div className="flex items-start gap-4">
                        <div className="w-10 h-10 bg-[#FAFAFA] border border-gray-50 rounded-xl flex items-center justify-center text-[#BA995D] font-black text-sm shadow-inner group-hover:bg-[#FDF2D1] transition-colors shrink-0">
                           {inv.clubName[0]}
                        </div>
                        <div>
                          <h3 className="text-xs font-black text-[#132F45] uppercase tracking-tight leading-none mb-1.5">{inv.clubName}</h3>
                          <div className="flex flex-wrap items-center gap-3 text-[8.5px] font-bold text-gray-400 uppercase tracking-widest">
                            <span>By: <span className="text-[#BA995D]">{inv.invitedBy}</span></span>
                            <span className="w-1 h-1 rounded-full bg-gray-200"></span>
                            <span>Expires: <span className="tabular-nums">{new Date(inv.expiresAt).toLocaleDateString()}</span></span>
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          setAcceptingId(inv.id);
                          setAcceptingPassword('');
                          setAcceptingConfirmPassword('');
                        }}
                        className="px-4 py-2 bg-[#BA995D] text-white text-[8px] font-black uppercase tracking-widest rounded-lg hover:bg-[#A3864D] transition-all shadow-md active:scale-95"
                      >
                        Accept
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        <div className="text-center pt-8">
           <Link to="/login" className="text-[9px] font-black text-[#132F45] uppercase tracking-widest hover:text-[#BA995D] transition-colors border-b border-[#132F45] pb-0.5">
            Return to Entry Portal
          </Link>
        </div>
      </div>
    </div>
  );
}