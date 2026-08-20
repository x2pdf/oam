package com.oam.app

import android.content.Intent
import android.os.Bundle
import androidx.appcompat.app.AppCompatActivity

class SplashActivity : AppCompatActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.splash_screen)

        // Native splash shows briefly while JS loads; branding duration is handled in React Native.
        startActivity(Intent(this, MainActivity::class.java))
        finish()
    }
}
