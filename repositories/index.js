const UserRepository = require('./user.repository');
const ClientRepository = require('./client.repository');
const ArtisanRepository = require('./artisan.repository');
const JobRepository = require('./job.repository');
const PaymentRepository = require('./payment.repository');
const LocationRepository = require('./location.repository');
const BOQRepository = require('./boq.repository');
const WarehouseRepository = require('./warehouse.repository');
const RatingRepository = require('./rating.repository');
const AuditRepository = require('./audit.repository');

module.exports = {
  UserRepository,
  ClientRepository,
  ArtisanRepository,
  JobRepository,
  PaymentRepository,
  LocationRepository,
  BOQRepository,
  WarehouseRepository,
  RatingRepository,
  AuditRepository
};