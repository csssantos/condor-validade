package com.usebipi.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.os.Build;
import android.widget.RemoteViews;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

import java.util.Map;

/**
 * Desenha o aviso do Bipi (cartão azul com o mascote e selo colorido). O servidor manda só DADOS
 * (titulo, corpo, selo, cor, tag, url). Qualquer outra mensagem (sem "titulo") e o token novo seguem para o
 * plugin de push do Capacitor, para o JavaScript continuar recebendo o token.
 */
public class BipiMessagingService extends FirebaseMessagingService {
    private static final String CANAL = "bipi_avisos";
    private static final String PLUGIN = "com.capacitorjs.plugins.pushnotifications.PushNotificationsPlugin";

    @Override
    public void onNewToken(String token) {
        super.onNewToken(token);
        try { Class.forName(PLUGIN).getMethod("onNewToken", String.class).invoke(null, token); } catch (Throwable t) { /* o próximo register() entrega o token */ }
    }

    @Override
    public void onMessageReceived(RemoteMessage mensagem) {
        Map<String, String> d = mensagem.getData();
        String titulo = d.get("titulo");
        if (titulo == null || titulo.isEmpty()) {
            try { Class.forName(PLUGIN).getMethod("sendRemoteMessage", RemoteMessage.class).invoke(null, mensagem); } catch (Throwable t) { /* ok */ }
            return;
        }
        String corpo = orVazio(d.get("corpo")), selo = orVazio(d.get("selo")), cor = orVazio(d.get("cor")), tag = orVazio(d.get("tag"));
        try {
            if (!NotificationManagerCompat.from(this).areNotificationsEnabled()) return;
            mostrarCartao(titulo, corpo, selo, cor, tag);
        } catch (Throwable t) {
            try { mostrarSimples(titulo, corpo, tag); } catch (Throwable t2) { /* sem como mostrar */ }
        }
    }

    private static String orVazio(String s) { return s == null ? "" : s; }

    private void criarCanal() {
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null && nm.getNotificationChannel(CANAL) == null) {
                NotificationChannel c = new NotificationChannel(CANAL, "Avisos do Bipi", NotificationManager.IMPORTANCE_HIGH);
                c.setDescription("Produtos perto de vencer, pedidos para aprovar e avisos da loja");
                nm.createNotificationChannel(c);
            }
        }
    }

    private PendingIntent abrirApp() {
        Intent i = getPackageManager().getLaunchIntentForPackage(getPackageName());
        if (i == null) i = new Intent();
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        return PendingIntent.getActivity(this, 0, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private void preencher(RemoteViews v, String titulo, String corpo, String selo, String cor) {
        v.setTextViewText(R.id.titulo, titulo);
        v.setTextViewText(R.id.corpo, corpo);
        if (!selo.isEmpty()) {
            v.setTextViewText(R.id.selo, selo);
            v.setViewVisibility(R.id.selo, android.view.View.VISIBLE);
            int fundo = R.drawable.pill_azul, texto = Color.parseColor("#06294F");
            if ("vermelho".equals(cor)) { fundo = R.drawable.pill_vermelho; texto = Color.WHITE; }
            else if ("ambar".equals(cor)) { fundo = R.drawable.pill_ambar; texto = Color.parseColor("#3B2700"); }
            else if ("verde".equals(cor)) { fundo = R.drawable.pill_verde; texto = Color.parseColor("#06331A"); }
            v.setInt(R.id.selo, "setBackgroundResource", fundo);
            v.setTextColor(R.id.selo, texto);
        }
    }

    private void mostrarCartao(String titulo, String corpo, String selo, String cor, String tag) {
        criarCanal();
        RemoteViews pequena = new RemoteViews(getPackageName(), R.layout.notif_bipi_pequena);
        RemoteViews grande = new RemoteViews(getPackageName(), R.layout.notif_bipi_grande);
        preencher(pequena, titulo, corpo, selo, cor);
        preencher(grande, titulo, corpo, selo, cor);
        NotificationCompat.Builder b = new NotificationCompat.Builder(this, CANAL)
                .setSmallIcon(R.drawable.ic_stat_bipi)
                .setColor(0xFF0B4F9E)
                .setContentTitle(titulo)
                .setContentText(corpo)
                .setStyle(new NotificationCompat.DecoratedCustomViewStyle())
                .setCustomContentView(pequena)
                .setCustomBigContentView(grande)
                .setContentIntent(abrirApp())
                .setAutoCancel(true)
                .setPriority(NotificationCompat.PRIORITY_HIGH);
        NotificationManagerCompat.from(this).notify(tag.isEmpty() ? null : tag, 0, b.build());
    }

    private void mostrarSimples(String titulo, String corpo, String tag) {
        criarCanal();
        NotificationCompat.Builder b = new NotificationCompat.Builder(this, CANAL)
                .setSmallIcon(R.drawable.ic_stat_bipi).setColor(0xFF0B4F9E)
                .setContentTitle(titulo).setContentText(corpo)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(corpo))
                .setContentIntent(abrirApp()).setAutoCancel(true)
                .setPriority(NotificationCompat.PRIORITY_HIGH);
        NotificationManagerCompat.from(this).notify(tag.isEmpty() ? null : tag, 0, b.build());
    }
}
