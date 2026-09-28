import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:intl/intl.dart';
import 'package:logger/logger.dart';

import 'app/app.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final logger = Logger();

  await Future.wait([
    dotenv.load(fileName: '.env'),
    initializeDateFormatting('vi_VN'),
  ]);
  Intl.defaultLocale = 'vi_VN';
  logger.i('APP_ENV=${dotenv.env['APP_ENV']} API=${dotenv.env['API_DEV_URL']}');

  await SystemChrome.setPreferredOrientations([
    DeviceOrientation.portraitUp,
    DeviceOrientation.portraitDown,
  ]);

  SystemChrome.setSystemUIOverlayStyle(
    const SystemUiOverlayStyle(
      statusBarColor: Colors.transparent,
      statusBarIconBrightness: Brightness.dark,
      systemNavigationBarColor: Colors.white,
      systemNavigationBarIconBrightness: Brightness.dark,
    ),
  );

  runApp(const ManageTeamsApp());
}
