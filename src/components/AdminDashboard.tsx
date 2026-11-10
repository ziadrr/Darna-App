import React, { useState } from 'react';
import {
  Shield,
  CheckCircle,
  XCircle,
  EyeOff,
  AlertTriangle,
  Users,
  FileText,
  MapPin,
  Tag,
  Search,
  Filter,
  Check,
  RefreshCw,
  Clock,
  ArrowUpRight
} from 'lucide-react';
import { Listing, ListingReport, User } from '../types';
import { formatMAD } from '../utils/rentalLogic';

interface AdminDashboardProps {
  listings: Listing[];
  reports: ListingReport[];
  users: User[];
  onModerateListing: (id: string, action: 'approve' | 'reject' | 'hide' | 'expire', reason?: string) => Promise<void>;
  onResolveReport: (id: string, action: 'resolve' | 'dismiss') => Promise<void>;
  onSelectListing: (listing: Listing) => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  listings,
  reports,
  users,
  onModerateListing,
  onResolveReport,
  onSelectListing,
}) => {
  const [activeTab, setActiveTab] = useState<'pending' | 'reports' | 'allListings' | 'users' | 'cndp'>('pending');
  const [filterText, setFilterText] = useState('');
  const [rejectReason, setRejectReason] = useState('Photos floues ou justificatif manquant');
  const [selectedPendingId, setSelectedPendingId] = useState<string | null>(null);

  const pendingListings = listings.filter((l) => l.status === 'en_attente');
  const reportedListings = reports.filter((r) => r.status === 'en_attente');

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-stone-900 to-[#1E3D34] text-white p-6 rounded-3xl shadow-lg border border-stone-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-amber-400 text-stone-900">
              <Shield className="w-5 h-5" />
            </span>
            <h1 className="text-xl sm:text-2xl font-bold">Console d'Administration & Modération Darna</h1>
          </div>
          <p className="text-xs text-stone-300 mt-1">
            Supervision du parc d'annonces au Maroc, vérification de conformité et traitement des signalements.
          </p>
        </div>

        {/* Counter Pills */}
        <div className="flex items-center gap-3">
          <div className="bg-white/10 px-4 py-2 rounded-2xl border border-white/10 text-center">
            <span className="block text-lg font-bold text-amber-300">{pendingListings.length}</span>
            <span className="text-[10px] uppercase font-semibold text-stone-300">En attente</span>
          </div>
          <div className="bg-white/10 px-4 py-2 rounded-2xl border border-white/10 text-center">
            <span className="block text-lg font-bold text-red-300">{reportedListings.length}</span>
            <span className="text-[10px] uppercase font-semibold text-stone-300">Signalements</span>
          </div>
          <div className="bg-white/10 px-4 py-2 rounded-2xl border border-white/10 text-center">
            <span className="block text-lg font-bold text-emerald-300">{listings.length}</span>
            <span className="text-[10px] uppercase font-semibold text-stone-300">Total Biens</span>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 border-b border-stone-200">
        {[
          { id: 'pending', label: `File de modération (${pendingListings.length})`, icon: Clock },
          { id: 'reports', label: `Signalements (${reportedListings.length})`, icon: AlertTriangle },
          { id: 'allListings', label: `Toutes les annonces (${listings.length})`, icon: FileText },
          { id: 'users', label: `Utilisateurs (${users.length})`, icon: Users },
          { id: 'cndp', label: 'Conformité CNDP & Légal', icon: Shield },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 whitespace-nowrap transition-all ${
                isActive
                  ? 'bg-[#1E3D34] text-white shadow-xs'
                  : 'text-stone-600 hover:text-stone-900 hover:bg-stone-100'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* TAB 1: PENDING LISTINGS QUEUE */}
      {activeTab === 'pending' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-stone-900 text-sm">
              Annonces soumises en attente d'approbation :
            </h3>
            <span className="text-xs text-stone-500">
              Chaque annonce doit respecter les critères de décence, prix réaliste et conformité CNDP.
            </span>
          </div>

          {pendingListings.length === 0 ? (
            <div className="p-12 text-center bg-white rounded-3xl border border-stone-200">
              <CheckCircle className="w-10 h-10 text-emerald-600 mx-auto mb-2" />
              <h4 className="font-bold text-stone-900 text-sm">File de modération vide</h4>
              <p className="text-xs text-stone-500">Toutes les annonces soumises ont été examinées.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {pendingListings.map((listing) => (
                <div
                  key={listing.id}
                  className="bg-white p-5 rounded-2xl border border-stone-200 shadow-xs flex flex-col md:flex-row gap-5 items-start justify-between"
                >
                  <div className="flex gap-4 items-start">
                    <img
                      src={listing.images[0] || 'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?auto=format&fit=crop&w=400&q=80'}
                      alt={listing.title}
                      className="w-24 h-24 rounded-xl object-cover shrink-0 border border-stone-200"
                    />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-stone-100 text-stone-700">
                          {listing.category}
                        </span>
                        <span className="text-xs text-stone-400">Réf : {listing.id}</span>
                        <span className="text-xs text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full font-semibold">
                          En attente
                        </span>
                      </div>

                      <h4
                        onClick={() => onSelectListing(listing)}
                        className="font-bold text-base text-stone-900 hover:text-[#C15C3D] cursor-pointer mt-1"
                      >
                        {listing.title}
                      </h4>
                      <p className="text-xs text-stone-500 mt-0.5">
                        📍 {listing.district}, {listing.city} • Loyer : <strong className="text-[#C15C3D]">{formatMAD(listing.price, listing.period)}</strong>
                      </p>
                      <p className="text-xs text-stone-600 line-clamp-2 mt-2 bg-stone-50 p-2 rounded-lg">
                        {listing.description}
                      </p>

                      <div className="text-[11px] text-stone-500 mt-2 flex items-center gap-3">
                        <span>Annonceur : <strong>{listing.contact.name}</strong> ({listing.contact.type})</span>
                        <span>Tél : {listing.contact.phone}</span>
                      </div>
                    </div>
                  </div>

                  {/* Moderation Actions */}
                  <div className="flex flex-col gap-2 shrink-0 w-full md:w-auto">
                    <button
                      onClick={() => onModerateListing(listing.id, 'approve')}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-xs transition-colors"
                    >
                      <CheckCircle className="w-4 h-4" />
                      <span>Approuver & Publier</span>
                    </button>

                    <button
                      onClick={() => onModerateListing(listing.id, 'reject', 'Photos non conformes ou prix incohérent.')}
                      className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-xs transition-colors"
                    >
                      <XCircle className="w-4 h-4" />
                      <span>Refuser l'annonce</span>
                    </button>

                    <button
                      onClick={() => onSelectListing(listing)}
                      className="px-4 py-1.5 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
                    >
                      <ArrowUpRight className="w-3.5 h-3.5" />
                      <span>Voir la fiche</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: REPORTS */}
      {activeTab === 'reports' && (
        <div className="space-y-4">
          <h3 className="font-bold text-stone-900 text-sm">Signalements déposés par les utilisateurs :</h3>

          {reports.length === 0 ? (
            <div className="p-8 text-center bg-white rounded-3xl border border-stone-200">
              <CheckCircle className="w-8 h-8 text-emerald-600 mx-auto mb-2" />
              <p className="text-xs text-stone-500">Aucun signalement actif.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3">
              {reports.map((report) => (
                <div
                  key={report.id}
                  className="bg-white p-4 rounded-2xl border border-stone-200 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-red-700 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full uppercase">
                        {report.reason.replace('_', ' ')}
                      </span>
                      <span className="text-xs text-stone-400">
                        {new Date(report.createdAt).toLocaleDateString('fr-FR')}
                      </span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${report.status === 'en_attente' ? 'bg-amber-100 text-amber-800' : 'bg-stone-100 text-stone-600'}`}>
                        {report.status}
                      </span>
                    </div>
                    <h4 className="font-bold text-sm text-stone-900 mt-1">
                      {report.listingTitle} (ID : {report.listingId})
                    </h4>
                    <p className="text-xs text-stone-600 mt-0.5 italic">
                      "{report.comment || 'Pas de commentaire supplémentaire'}"
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => onModerateListing(report.listingId, 'hide', `Masquée suite au signalement ${report.id}`)}
                      className="px-3.5 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold flex items-center gap-1 shadow-xs"
                    >
                      <EyeOff className="w-3.5 h-3.5" />
                      <span>Masquer le bien</span>
                    </button>
                    <button
                      onClick={() => onResolveReport(report.id, 'dismiss')}
                      className="px-3.5 py-1.5 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-xl text-xs font-bold"
                    >
                      Rejeter le signalement
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: ALL LISTINGS */}
      {activeTab === 'allListings' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-stone-900 text-sm">Gestion de l'ensemble du catalogue :</h3>
            <span className="text-xs text-stone-500">{listings.length} biens répertoriés</span>
          </div>

          <div className="overflow-x-auto bg-white rounded-2xl border border-stone-200">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#FAF7F2] border-b border-stone-200 text-stone-600 uppercase font-bold text-[10px]">
                <tr>
                  <th className="p-3">Bien</th>
                  <th className="p-3">Ville / Quartier</th>
                  <th className="p-3">Prix</th>
                  <th className="p-3">Statut</th>
                  <th className="p-3">Vues / Favs</th>
                  <th className="p-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {listings.map((l) => (
                  <tr key={l.id} className="hover:bg-stone-50">
                    <td className="p-3 font-semibold text-stone-900 max-w-[200px] truncate">
                      {l.title}
                    </td>
                    <td className="p-3 text-stone-600">
                      {l.district}, {l.city}
                    </td>
                    <td className="p-3 font-bold text-[#C15C3D]">
                      {formatMAD(l.price, l.period)}
                    </td>
                    <td className="p-3">
                      <span
                        className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${
                          l.status === 'publiee'
                            ? 'bg-emerald-100 text-emerald-800'
                            : l.status === 'en_attente'
                            ? 'bg-amber-100 text-amber-800'
                            : l.status === 'masquee'
                            ? 'bg-red-100 text-red-800'
                            : 'bg-stone-100 text-stone-600'
                        }`}
                      >
                        {l.status}
                      </span>
                    </td>
                    <td className="p-3 text-stone-500">
                      👁️ {l.viewsCount} • ❤️ {l.favoritesCount}
                    </td>
                    <td className="p-3">
                      <div className="flex items-center gap-1.5">
                        {l.status !== 'publiee' && (
                          <button
                            onClick={() => onModerateListing(l.id, 'approve')}
                            className="p-1 rounded bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                            title="Publier"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {l.status !== 'masquee' && (
                          <button
                            onClick={() => onModerateListing(l.id, 'hide')}
                            className="p-1 rounded bg-red-50 text-red-700 hover:bg-red-100"
                            title="Masquer"
                          >
                            <EyeOff className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button
                          onClick={() => onSelectListing(l)}
                          className="p-1 rounded bg-stone-100 text-stone-700 hover:bg-stone-200"
                          title="Voir"
                        >
                          <ArrowUpRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: USERS */}
      {activeTab === 'users' && (
        <div className="space-y-4">
          <h3 className="font-bold text-stone-900 text-sm">Comptes utilisateurs enregistrés :</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {users.map((u) => (
              <div key={u.id} className="bg-white p-4 rounded-2xl border border-stone-200 shadow-xs space-y-2">
                <div className="flex items-center gap-3">
                  <img src={u.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80'} alt={u.name} className="w-10 h-10 rounded-full object-cover" />
                  <div>
                    <h4 className="font-bold text-xs text-stone-900">{u.name}</h4>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-stone-100 text-stone-700 uppercase">
                      {u.role}
                    </span>
                  </div>
                </div>
                <div className="text-xs text-stone-500 space-y-0.5 pt-2 border-t border-stone-100">
                  <div>📧 {u.email}</div>
                  <div>📞 {u.phone}</div>
                  <div>📍 {u.city || 'Maroc'}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 5: CNDP & LEGAL AUDIT */}
      {activeTab === 'cndp' && (
        <div className="bg-white p-6 rounded-3xl border border-stone-200 space-y-4">
          <div className="flex items-center gap-2 text-stone-900 font-bold text-base">
            <Shield className="w-5 h-5 text-[#C15C3D]" />
            <h3>Points de Vigilance Juridique & CNDP (Loi 09-08 au Maroc)</h3>
          </div>

          <div className="text-xs text-stone-700 leading-relaxed space-y-3">
            <p className="bg-amber-50 border border-amber-200 p-4 rounded-2xl text-amber-900">
              ⚠️ <strong>Note Juridique Importante avant Mise en Production Réelle :</strong><br />
              La législation marocaine impose des obligations strictes aux éditeurs de plateformes web d'annonces mettant en relation des tiers.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              <div className="bg-stone-50 p-4 rounded-2xl border border-stone-200 space-y-2">
                <h4 className="font-bold text-stone-900">1. Déclaration CNDP (Loi n° 09-08)</h4>
                <p className="text-stone-600">
                  Avant tout déploiement public avec collecte de données personnelles (nom, téléphone, adresse, CIN), un dossier de notification/déclaration préalable doit être formellement déposé auprès de la Commission Nationale de contrôle de la protection des Données à caractère Personnel (CNDP) à Rabat.
                </p>
              </div>

              <div className="bg-stone-50 p-4 rounded-2xl border border-stone-200 space-y-2">
                <h4 className="font-bold text-stone-900">2. Rôle d'Hébergeur & Non-Intermédiaire</h4>
                <p className="text-stone-600">
                  Darna agit strictement comme hébergeur de petites annonces au sens légal et ne perçoit pas les loyers ni les dépôts de garantie. Les transactions doivent s'effectuer directement entre bailleur et locataire avec signature d'un bail écrit légalisé (loi 67-12).
                </p>
              </div>

              <div className="bg-stone-50 p-4 rounded-2xl border border-stone-200 space-y-2">
                <h4 className="font-bold text-stone-900">3. Masquage des Adresses et Téléphones</h4>
                <p className="text-stone-600">
                  Conformément au principe de minimisation des données de la CNDP, notre système permet à tout annonceur de masquer son numéro et son adresse exacte aux simples visiteurs non vérifiés.
                </p>
              </div>

              <div className="bg-stone-50 p-4 rounded-2xl border border-stone-200 space-y-2">
                <h4 className="font-bold text-stone-900">4. Droit d'Accès et de Rectification</h4>
                <p className="text-stone-600">
                  Tout utilisateur peut exercer à tout moment ses droits d'accès, d'opposition et de rectification de ses données en s'adressant au délégué à la protection des données Darna à contact@darna.ma.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
